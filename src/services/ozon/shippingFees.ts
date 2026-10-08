import { AppError } from "@/lib/errors";
import { setTimeout as wait } from "node:timers/promises";
import { normalizeProductCode } from "@/services/ozon/comparisonWorkbook";

export type OzonStore = "omega" | "nozzle";
export type ShippingReportProgress = { value: number; stage: string };

type OzonCredentials = { clientId: string; apiKey: string };
type Money = { amount?: string; currency?: string };
type AccrualType = { id: number; name?: string; description?: string };
type PostingAccrual = { type_id: number; sku?: string | number; accrual_date?: string; accrued?: Money };
type PostingAccrualGroup = { posting_number: string; accruals?: PostingAccrual[] };
type PostingProduct = { productCode: string; sku: string; quantity: number };

export type ShippingFeeRow = {
  store: OzonStore;
  postingNumber: string;
  status: string;
  delivered: boolean;
  accrualDate: string;
  productCode: string;
  quantity: number;
  currency: string;
  feeAmount: number | null;
  usdRate: number;
  feeUsd: number | null;
  comparisonFeeUsd: number | null;
  feeDifferenceUsd: number | null;
  note: string;
};

const OZON_API = "https://api-seller.ozon.ru";
const STORE_LABELS: Record<OzonStore, string> = { omega: "OMEGA", nozzle: "NOZZLE" };
const STATUS_LABELS: Record<string, string> = {
  delivered: "Teslim Edildi",
  delivering: "Yolda",
  canceled: "İptal Edildi",
  cancelled: "İptal Edildi",
  awaiting_registration: "Kayıt Bekliyor",
  acceptance_in_progress: "Kabul Ediliyor",
  awaiting_approve: "Onay Bekliyor",
  awaiting_packaging: "Hazırlanmayı Bekliyor",
  awaiting_verification: "Doğrulama Bekliyor",
  awaiting_deliver: "Gönderime Hazır",
  not_accepted: "Kabul Edilmedi",
  client_arbitration: "Müşteri İtirazı",
  arbitration: "İtiraz Sürecinde",
  unknown: "Bilinmiyor",
};

export function parsePostingNumbers(input: string) {
  const prepared = input.replace(/\\[nr]/gi, "\n");
  return [...new Set(prepared.split(/[\s,;\\]+/).map((value) => value.trim().replace(/^["']|["']$/g, "")).filter(Boolean))];
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zа-яё0-9]+/giu, " ").trim();
}

export function translatePostingStatus(status: string) {
  return STATUS_LABELS[status.toLowerCase()] || status;
}

export function formatAccrualDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

export function findInternationalDeliveryTypes(types: AccrualType[]) {
  const configured = (process.env.OZON_INTERNATIONAL_DELIVERY_TYPE_IDS || "").split(",").map((value) => value.trim()).filter(Boolean).map(Number).filter(Number.isInteger);
  if (configured.length) return types.filter((type) => configured.includes(type.id));
  return types.filter((type) => {
    const value = normalize(`${type.name || ""} ${type.description || ""}`);
    return value.includes("international delivery")
      || value.includes("internationaldelivery")
      || value.includes("cross border delivery")
      || value.includes("crossborderdelivery")
      || (value.includes("uluslararası") && value.includes("teslimat"))
      || (value.includes("международ") && value.includes("достав"));
  });
}

function credentialsFor(store: OzonStore): OzonCredentials {
  const prefix = store === "omega" ? "OZON_OMEGA" : "OZON_NOZZLE";
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim() || "";
  const apiKey = process.env[`${prefix}_API_KEY`]?.trim() || "";
  if (!clientId || !apiKey) throw new AppError(`${STORE_LABELS[store]} mağazası için Ozon Client-Id ve Api-Key yapılandırılmamış.`, "OZON_CREDENTIALS_MISSING");
  return { clientId, apiKey };
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

class OzonClient {
  private lastRequestAt = 0;

  constructor(private readonly credentials: OzonCredentials) {}

  async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const minInterval = millisecondsFromEnv("OZON_API_MIN_INTERVAL_MS", 1100);
    const retryBase = millisecondsFromEnv("OZON_API_RETRY_BASE_MS", 1200);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slotDelay = Math.max(0, this.lastRequestAt + minInterval - Date.now());
      if (slotDelay) await wait(slotDelay, undefined, signal ? { signal } : undefined);
      this.lastRequestAt = Date.now();
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
      const response = await fetch(`${OZON_API}${path}`, {
        method: "POST",
        headers: { "Client-Id": this.credentials.clientId, "Api-Key": this.credentials.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: requestSignal,
      });
      const data = await response.json().catch(() => ({})) as { message?: string };
      if (response.status === 429 && attempt < 4) {
        const retryDelay = Math.max(retryAfterMilliseconds(response), retryBase * (2 ** attempt));
        if (retryDelay) await wait(Math.min(retryDelay, 15_000), undefined, signal ? { signal } : undefined);
        continue;
      }
      if (!response.ok) {
        const message = response.status === 401 || response.status === 403
          ? "Ozon API erişimi reddedildi. Client-Id ve Api-Key bilgilerini kontrol edin."
          : response.status === 429
            ? "Ozon istek limiti geçici olarak dolu. Birkaç saniye sonra yeniden deneyin."
            : `Ozon API isteği başarısız oldu (${response.status}).`;
        throw new AppError(data.message ? `${message} ${data.message}` : message, "OZON_API_ERROR");
      }
      return data as T;
    }
    throw new AppError("Ozon istek limiti geçici olarak dolu. Birkaç saniye sonra yeniden deneyin.", "OZON_RATE_LIMIT");
  }
}

async function postingDetails(postingNumber: string, client: OzonClient, signal?: AbortSignal) {
  type Product = { offer_id?: string; sku?: string | number; quantity?: number };
  const data = await client.post<{ result?: { status?: string; products?: Product[] }; status?: string; products?: Product[] }>("/v3/posting/fbs/get", { posting_number: postingNumber }, signal);
  const result = data.result || data;
  const products = new Map<string, PostingProduct>();
  for (const product of result.products || []) {
    const sku = String(product.sku || "").trim();
    const productCode = String(product.offer_id || sku).trim();
    const key = `${sku}:${productCode}`;
    if (!productCode) continue;
    const quantity = Math.max(1, Math.trunc(Number(product.quantity) || 1));
    const existing = products.get(key);
    products.set(key, { productCode, sku, quantity: (existing?.quantity || 0) + quantity });
  }
  return { status: result.status || "unknown", products: [...products.values()] };
}

export async function createShippingFeeReport(store: OzonStore, postingNumbers: string[], usdRate: number, signal?: AbortSignal, comparisonFees?: ReadonlyMap<string, number>, onProgress?: (progress: ShippingReportProgress) => void): Promise<ShippingFeeRow[]> {
  const credentials = credentialsFor(store);
  const client = new OzonClient(credentials);
  onProgress?.({ value: 5, stage: "Ozon tahakkuk türleri alınıyor" });
  const typeResponse = await client.post<{ accrual_types?: AccrualType[] }>("/v1/finance/accrual/types", {}, signal);
  const internationalTypes = findInternationalDeliveryTypes(typeResponse.accrual_types || []);
  if (!internationalTypes.length) throw new AppError("Ozon tahakkuk türleri içinde ‘Uluslararası teslimat hizmeti’ bulunamadı. Tür kimliğini ayarlamak gerekebilir.", "OZON_FEE_TYPE_NOT_FOUND");
  const typeIds = new Set(internationalTypes.map((type) => type.id));

  const statuses: Array<{ postingNumber: string; status: string; products: PostingProduct[]; error: string }> = [];
  for (const [index, postingNumber] of postingNumbers.entries()) {
    try { statuses.push({ postingNumber, ...await postingDetails(postingNumber, client, signal), error: "" }); }
    catch (error) {
      if (signal?.aborted) throw error;
      statuses.push({ postingNumber, status: "unknown", products: [], error: error instanceof AppError ? error.userMessage : "Sipariş durumu sorgulanamadı." });
    }
    onProgress?.({ value: 10 + Math.round(((index + 1) / postingNumbers.length) * 50), stage: `Siparişler sorgulanıyor (${index + 1}/${postingNumbers.length})` });
  }
  const delivered = statuses.filter((item) => item.status.toLowerCase() === "delivered").map((item) => item.postingNumber);
  const accruals = new Map<string, PostingAccrual[]>();
  const batchCount = Math.max(1, Math.ceil(delivered.length / 200));
  for (let index = 0; index < delivered.length; index += 200) {
    const response = await client.post<{ posting_accruals?: PostingAccrualGroup[] }>("/v1/finance/accrual/postings", { posting_numbers: delivered.slice(index, index + 200) }, signal);
    for (const group of response.posting_accruals || []) accruals.set(group.posting_number, group.accruals || []);
    const completedBatch = Math.floor(index / 200) + 1;
    onProgress?.({ value: 60 + Math.round((completedBatch / batchCount) * 25), stage: `Teslimat tahakkukları alınıyor (${completedBatch}/${batchCount})` });
  }
  if (!delivered.length) onProgress?.({ value: 85, stage: "Teslim edilmiş sipariş bulunamadı" });
  onProgress?.({ value: 88, stage: "Rapor verileri hazırlanıyor" });

  return statuses.flatMap(({ postingNumber, status, products, error }) => {
    const isDelivered = status.toLowerCase() === "delivered";
    const allMatches = (accruals.get(postingNumber) || []).filter((item) => typeIds.has(Number(item.type_id)));
    const productRows = products.length ? products : [{ productCode: "", sku: "", quantity: 1 }];
    return productRows.map((product) => {
      const matches = productRows.length === 1
        ? allMatches
        : allMatches.filter((item) => String(item.sku || "").trim() === product.sku);
      const accrualDates = [...new Set(matches.map((item) => item.accrual_date || "").filter(Boolean))].map(formatAccrualDate).join(", ");
      const currencies = [...new Set(matches.map((item) => item.accrued?.currency || "RUB"))];
      const netAmount = matches.reduce((sum, item) => sum + Number(item.accrued?.amount || 0), 0);
      const feeAmount = matches.length ? Math.max(0, -netAmount) : null;
      const currency = currencies.join(", ") || "RUB";
      const convertible = feeAmount !== null && currencies.every((value) => !value || value === "RUB");
      const feeUsd = convertible && feeAmount !== null ? feeAmount / usdRate : null;
      const comparisonFee = comparisonFees?.get(normalizeProductCode(product.productCode));
      const comparisonMissing = Boolean(comparisonFees) && comparisonFee === undefined;
      const baseNote = error || !isDelivered
        ? error || "Sipariş teslim edilmediği için tahakkuk aranmadı."
        : !matches.length
          ? "Bu ürün için uluslararası teslimat hizmeti tahakkuku bulunamadı."
          : !convertible
            ? "Tahakkuk RUB olmadığı için dolar dönüşümü yapılmadı."
            : "";
      const note = [baseNote, comparisonMissing ? "Ürün için kıyaslama kargo ücreti bulunamadı." : ""].filter(Boolean).join(" ");
      return {
        store,
        postingNumber,
        status: error ? "Sorgulanamadı" : translatePostingStatus(status),
        delivered: isDelivered,
        accrualDate: error ? "Sorgulanamadı" : isDelivered ? accrualDates || "Tahakkuk Bulunamadı" : translatePostingStatus(status),
        productCode: product.productCode,
        quantity: product.quantity,
        currency,
        feeAmount,
        usdRate,
        feeUsd,
        comparisonFeeUsd: comparisonFee ?? null,
        feeDifferenceUsd: comparisonFee !== undefined && feeUsd !== null ? (comparisonFee * product.quantity) - feeUsd : null,
        note,
      };
    });
  });
}

export const ozonStoreLabel = (store: OzonStore) => STORE_LABELS[store];
