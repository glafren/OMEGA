import { setTimeout as wait } from "node:timers/promises";
import { AppError } from "@/lib/errors";

export type UsdRubRate = {
  requestedDate: string;
  effectiveDate: string;
  rubPerUsd: number;
};

const CBR_DAILY_URL = "https://www.cbr.ru/scripts/XML_daily_eng.asp";
const MAX_ATTEMPTS = 4;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const rateCache = new Map<string, UsdRubRate>();

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

function cbrUrl(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new AppError("Tahakkuk tarihi kur sorgusu için geçersiz.", "INVALID_ACCRUAL_DATE");
  return `${CBR_DAILY_URL}?date_req=${match[3]}/${match[2]}/${match[1]}`;
}

export function parseCbrUsdRate(xml: string, requestedDate: string): UsdRubRate {
  const rateDate = xml.match(/<ValCurs[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/i);
  const usdBlock = [...xml.matchAll(/<Valute\b[^>]*>[\s\S]*?<\/Valute>/gi)]
    .map((match) => match[0])
    .find((block) => /<CharCode>\s*USD\s*<\/CharCode>/i.test(block)) || "";
  const nominalText = usdBlock.match(/<Nominal>([^<]+)<\/Nominal>/i)?.[1]?.replace(",", ".") || "";
  const valueText = usdBlock.match(/<Value>([^<]+)<\/Value>/i)?.[1]?.replace(",", ".") || "";
  const nominal = Number(nominalText);
  const value = Number(valueText);
  if (!rateDate || !Number.isFinite(nominal) || nominal <= 0 || !Number.isFinite(value) || value <= 0) {
    throw new AppError("Rusya Merkez Bankası yanıtında USD/RUB kuru bulunamadı.", "CBR_RATE_INVALID");
  }
  return {
    requestedDate,
    effectiveDate: `${rateDate[3]}-${rateDate[2]}-${rateDate[1]}`,
    rubPerUsd: value / nominal,
  };
}

export async function fetchUsdRubRate(date: string, signal?: AbortSignal): Promise<UsdRubRate> {
  const cached = rateCache.get(date);
  if (cached) return cached;
  const url = cbrUrl(date);
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        const xml = new TextDecoder("windows-1251").decode(await response.arrayBuffer());
        const rate = parseCbrUsdRate(xml, date);
        rateCache.set(date, rate);
        return rate;
      }
      const error = new AppError(`Rusya Merkez Bankası kur servisi yanıt vermedi (${response.status}).`, "CBR_RATE_UNAVAILABLE");
      if (!RETRYABLE_STATUSES.has(response.status)) throw error;
      lastError = error;
    } catch (error) {
      if (signal?.aborted
        || error instanceof AppError && error.code !== "CBR_RATE_UNAVAILABLE"
        || response && !RETRYABLE_STATUSES.has(response.status)) throw error;
      lastError = error;
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      const base = millisecondsFromEnv("CBR_RATE_RETRY_BASE_MS", 750);
      const delay = Math.max(response ? retryAfterMilliseconds(response) : 0, base * (2 ** attempt));
      if (delay) await wait(Math.min(delay, 10_000), undefined, signal ? { signal } : undefined);
    }
  }

  throw new AppError("Tahakkuk tarihindeki USD/RUB kuru Rusya Merkez Bankası’ndan alınamadı. Lütfen yeniden deneyin.", "CBR_RATE_UNAVAILABLE", { cause: lastError });
}

export async function fetchUsdRubRates(dates: Iterable<string>, signal?: AbortSignal) {
  const result = new Map<string, UsdRubRate>();
  for (const date of new Set(dates)) result.set(date, await fetchUsdRubRate(date, signal));
  return result;
}
