import ExcelJS from "exceljs";
import { setTimeout as wait } from "node:timers/promises";
import { AppError } from "@/lib/errors";
import type { OzonStore } from "@/services/ozon/shippingFees";

const PRODUCT_HEADERS = new Set(["urun kodu", "product code", "sku", "offer id", "offer_id"]);
const FEE_HEADERS = new Set(["kargo ucreti", "kargo ucreti usd", "kargo bedeli", "kargo bedeli usd", "shipping fee", "shipping fee usd", "shipping cost", "shipping cost usd"]);
const MAX_SIZE = 10 * 1024 * 1024;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const lastSuccessfulFees = new Map<OzonStore, ReadonlyMap<string, number>>();
const DEFAULT_COMPARISON_SHEETS: Record<OzonStore, string> = {
  omega: "https://docs.google.com/spreadsheets/d/1QDoYFvcWtyUJ_PZfqYyu0BSCNAY157pPom5WIvcRJT4/edit?usp=sharing",
  nozzle: "https://docs.google.com/spreadsheets/d/1Sg6i9BNquHH9RMQ5ipyyqKiX31MtrtiWQKmOtL-rHs4/edit?usp=sharing",
};

function normalizeHeader(value: string) {
  return value.toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, " ")
    .trim();
}

export function normalizeProductCode(value: string) {
  return value.trim().toLocaleUpperCase("tr-TR");
}

export function googleShippingComparisonSheetUrl(store: OzonStore) {
  const envName = store === "omega" ? "GOOGLE_OMEGA_SHIPPING_FEES_URL" : "GOOGLE_NOZZLE_SHIPPING_FEES_URL";
  return process.env[envName]?.trim() || DEFAULT_COMPARISON_SHEETS[store];
}

export function googleShippingComparisonExportUrl(sheetUrl: string) {
  const url = new URL(sheetUrl);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") throw new AppError("Google kargo ücreti bağlantısı geçersiz.", "INVALID_GOOGLE_SHEET_URL");
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (!match) throw new AppError("Google kargo ücreti bağlantısında tablo kimliği bulunamadı.", "INVALID_GOOGLE_SHEET_URL");
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
}

function millisecondsFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function retryAfterMilliseconds(response: Response) {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function waitBeforeRetry(attempt: number, response: Response | undefined, signal?: AbortSignal) {
  const base = millisecondsFromEnv("GOOGLE_SHEET_RETRY_BASE_MS", 750);
  const delay = Math.max(response ? retryAfterMilliseconds(response) : 0, base * (2 ** attempt));
  if (delay) await wait(Math.min(delay, 10_000), undefined, signal ? { signal } : undefined);
}

function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  return cell.text.trim();
}

function parseUsd(value: string) {
  const cleaned = value.replace(/\s/g, "").replace(/[$₺₽]/g, "");
  const normalized = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replaceAll(".", "").replace(",", ".")
      : cleaned.replaceAll(",", "")
    : cleaned.replace(",", ".");
  return Number(normalized);
}

export async function parseShippingComparisonWorkbook(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new AppError("Kıyaslama Excel dosyası açılamadı. Geçerli bir .xlsx dosyası yükleyin.", "INVALID_COMPARISON_FILE");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError("Kıyaslama Excel dosyasında çalışma sayfası bulunamadı.", "INVALID_COMPARISON_FILE");

  let productColumn = 0;
  let feeColumn = 0;
  sheet.getRow(1).eachCell((cell, column) => {
    const header = normalizeHeader(cellText(cell));
    if (PRODUCT_HEADERS.has(header)) productColumn = column;
    if (FEE_HEADERS.has(header)) feeColumn = column;
  });
  if (!productColumn || !feeColumn) {
    throw new AppError("Excel’in ilk satırında ‘Ürün Kodu’ ve ‘Kargo Ücreti (USD)’ başlıkları bulunmalıdır.", "INVALID_COMPARISON_HEADERS");
  }

  const fees = new Map<string, number>();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const rawCode = cellText(row.getCell(productColumn));
    const rawFee = cellText(row.getCell(feeColumn));
    if (!rawCode && !rawFee) continue;
    const code = normalizeProductCode(rawCode);
    const fee = parseUsd(rawFee);
    if (!code || !Number.isFinite(fee) || fee < 0) {
      throw new AppError(`Kıyaslama Excel dosyasının ${rowNumber}. satırındaki ürün kodu veya USD kargo ücreti geçersiz.`, "INVALID_COMPARISON_ROW");
    }
    const existing = fees.get(code);
    if (existing !== undefined && existing !== fee) {
      throw new AppError(`Kıyaslama Excel dosyasında ‘${rawCode}’ ürün kodu farklı ücretlerle birden fazla kez bulunuyor.`, "DUPLICATE_COMPARISON_PRODUCT");
    }
    fees.set(code, fee);
  }
  if (!fees.size) throw new AppError("Kıyaslama Excel dosyasında ürün kaydı bulunamadı.", "EMPTY_COMPARISON_FILE");
  return fees;
}

export async function fetchShippingComparisonFees(store: OzonStore, signal?: AbortSignal) {
  const url = googleShippingComparisonExportUrl(googleShippingComparisonSheetUrl(store));
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        cache: "no-store",
        redirect: "follow",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > MAX_SIZE) throw new AppError("Google kargo ücreti tablosu 10 MB sınırını aşıyor.", "INVALID_COMPARISON_FILE");
        const fees = await parseShippingComparisonWorkbook(await response.arrayBuffer());
        lastSuccessfulFees.set(store, new Map(fees));
        return fees;
      }
      const error = new AppError(`Google kargo ücreti tablosu indirilemedi (${response.status}). Paylaşım iznini kontrol edin.`, "GOOGLE_SHEET_UNAVAILABLE");
      if (!RETRYABLE_STATUSES.has(response.status)) throw error;
      lastError = error;
    } catch (error) {
      if (signal?.aborted
        || error instanceof AppError && error.code !== "GOOGLE_SHEET_UNAVAILABLE"
        || response && !RETRYABLE_STATUSES.has(response.status)) throw error;
      lastError = error;
    }
    if (attempt < MAX_ATTEMPTS - 1) await waitBeforeRetry(attempt, response, signal);
  }

  const cached = lastSuccessfulFees.get(store);
  if (cached) return new Map(cached);
  throw new AppError("Google kargo ücreti tablosuna birkaç denemeden sonra ulaşılamadı. İnternet bağlantısını ve tablo paylaşım iznini kontrol edin.", "GOOGLE_SHEET_UNAVAILABLE", { cause: lastError });
}
