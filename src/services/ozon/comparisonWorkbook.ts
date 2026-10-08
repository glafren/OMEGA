import ExcelJS from "exceljs";
import { AppError } from "@/lib/errors";

const PRODUCT_HEADERS = new Set(["urun kodu", "product code", "sku", "offer id", "offer_id"]);
const FEE_HEADERS = new Set(["kargo ucreti", "kargo ucreti usd", "kargo bedeli", "kargo bedeli usd", "shipping fee", "shipping fee usd", "shipping cost", "shipping cost usd"]);

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
