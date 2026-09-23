import { chromium } from "playwright";
import { appConfig } from "@/config/app-config";
import { AppError } from "@/lib/errors";
import { isAllowedIkeaUrl, normalizeProductCode } from "@/lib/validation";
import type { IkeaProduct } from "@/types";
import { deduplicateImageUrls } from "./imageExtractor";
import { parseProductPage } from "./ikeaParser";
import { extractProductCode } from "./productCode";

export type ScrapeProgress = (stage: "RESOLVING_PRODUCT" | "OPENING_IKEA_PAGE" | "EXTRACTING_PRODUCT_DATA" | "EXTRACTING_IMAGES", message: string, progress: number) => void;

async function resolveInput(input: string): Promise<string> {
  if (isAllowedIkeaUrl(input)) return input;
  const code = normalizeProductCode(input);
  if (!code) throw new AppError("Geçerli bir IKEA ürün linki girin.", "INVALID_INPUT");
  const digits = code.replace(/\D/g, "");
  const productUrl = `https://www.ikea.com.tr/p${digits}`;
  const response = await fetch(productUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "Mozilla/5.0 IKEA-Ozon-Studio/1.0" } });
  if (!response.ok || !isAllowedIkeaUrl(response.url)) throw new AppError("Ürün kodu otomatik bulunamadı. Lütfen IKEA ürün linkini girin.", "CODE_NOT_RESOLVED");
  return response.url;
}

export function extractModelName(fullName?: string): string | null {
  const baseName = fullName?.replace(/\s+/g, " ").trim().split(/[–—,|]/)[0].trim();
  if (!baseName) return null;
  const tokens = baseName.split(/\s+/);
  if (tokens[0]?.toUpperCase() === "IKEA" && tokens[1]) return `${tokens[0]} ${tokens[1]}`;
  return tokens[0] || null;
}

export async function scrapeIkeaProduct(input: string, progress: ScrapeProgress): Promise<IkeaProduct> {
  progress("RESOLVING_PRODUCT", "Ürün adresi çözümleniyor", 10);
  const sourceUrl = await resolveInput(input);
  if (!isAllowedIkeaUrl(sourceUrl)) throw new AppError("Yalnızca IKEA ürün adreslerine izin verilir.", "URL_NOT_ALLOWED");
  progress("OPENING_IKEA_PAGE", "IKEA ürün sayfası açılıyor", 18);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36" });
    const page = await context.newPage();
    page.setDefaultTimeout(appConfig.playwrightTimeout);
    const response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: appConfig.playwrightTimeout });
    if (!response?.ok()) throw new AppError("IKEA ürün sayfasına ulaşılamadı.", "PAGE_UNAVAILABLE");
    await page.waitForTimeout(1200);
    await page.evaluate(async () => { for (let y = 0; y < Math.min(document.body.scrollHeight, 5000); y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } window.scrollTo(0, 0); });
    progress("EXTRACTING_PRODUCT_DATA", "Ürün bilgileri alınıyor", 28);
    const raw = await parseProductPage(page);
    const finalUrl = page.url();
    const productCode = extractProductCode(raw.code, finalUrl, input);
    const fullName = raw.name?.replace(/\s+/g, " ").trim();
    const modelName = extractModelName(fullName);
    if (!productCode || !modelName) throw new AppError("Ürün bilgileri alınamadı.", "PRODUCT_DATA_MISSING");
    progress("EXTRACTING_IMAGES", "Ürün görselleri aranıyor", 36);
    const images = deduplicateImageUrls(raw.images).filter((image) => !image.width || image.width >= 300).slice(0, 20);
    if (!images.length) throw new AppError("Bu ürün için görsel bulunamadı.", "NO_IMAGES");
    return { productCode, modelName, fullName, sourceUrl: finalUrl, images };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("IKEA ürün sayfası işlenemedi.", "SCRAPE_FAILED", { cause: error });
  } finally { await browser.close(); }
}
