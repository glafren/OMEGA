import { chromium } from "playwright";
import type { Browser } from "playwright";
import { appConfig } from "@/config/app-config";
import { AppError } from "@/lib/errors";
import { isAllowedPhilipsHueUrl } from "@/lib/validation";
import type { IkeaProduct, IkeaProductImage, PhilipsFeature } from "@/types";
import type { ScrapeProgress } from "@/services/ikea/ikeaScraper";

const PHILIPS_HUE_IMAGE_WIDTH = 1280;
const PHILIPS_HUE_IMAGE_HEIGHT = 960;

function productCodeFromUrl(input: string) {
  try {
    const segments = new URL(input).pathname.split("/").filter(Boolean);
    const code = segments.at(-1);
    return code && /^\d+$/.test(code) ? code : null;
  } catch { return null; }
}

export function canonicalizePhilipsHueImage(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "www.assets.signify.com" || !url.pathname.toLowerCase().startsWith("/is/image/signify/")) return null;
    return `${url.origin}${url.pathname}?wid=${PHILIPS_HUE_IMAGE_WIDTH}&hei=${PHILIPS_HUE_IMAGE_HEIGHT}&qlt=100`;
  } catch { return null; }
}

export async function scrapePhilipsHueProduct(input: string, progress: ScrapeProgress, signal?: AbortSignal): Promise<IkeaProduct> {
  await progress("RESOLVING_PRODUCT", "Philips Hue ürün adresi doğrulanıyor", 10);
  if (!isAllowedPhilipsHueUrl(input)) throw new AppError("Geçerli bir Philips Hue Türkiye ürün linki girin.", "INVALID_INPUT");
  await progress("OPENING_IKEA_PAGE", "Philips Hue ürün sayfası açılıyor", 18);
  let browser: Browser | undefined;
  const abort = () => { void browser?.close().catch(() => undefined); };
  try {
    browser = await chromium.launch({ headless: true });
    signal?.addEventListener("abort", abort, { once: true });
    const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36" });
    const page = await context.newPage();
    page.setDefaultTimeout(appConfig.playwrightTimeout);
    const response = await page.goto(input, { waitUntil: "domcontentloaded", timeout: appConfig.playwrightTimeout });
    if (!response?.ok() || !isAllowedPhilipsHueUrl(page.url())) throw new AppError("Philips Hue ürün sayfasına ulaşılamadı.", "PAGE_UNAVAILABLE");
    await page.waitForTimeout(1500);
    if (signal?.aborted) throw new DOMException("İşlem durduruldu.", "AbortError");
    await page.locator("#onetrust-reject-all-handler").click({ timeout: 2_000 }).catch(() => undefined);
    await progress("EXTRACTING_PRODUCT_DATA", "Philips Hue ürün bilgileri alınıyor", 28);
    const raw = await page.evaluate(() => ({
      name: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "",
      images: [...document.querySelectorAll<HTMLImageElement>(".product-carousel__bottom-carousel img")].map((image) => image.currentSrc || image.src),
      features: [...document.querySelectorAll<HTMLElement>(".product-marketing-copy-component .product-marketing-copy__item")].map((item) => ({
        image: item.querySelector<HTMLImageElement>(".product-marketing-copy__image")?.currentSrc || item.querySelector<HTMLImageElement>(".product-marketing-copy__image")?.src || "",
        title: item.querySelector(".product-marketing-copy__title")?.textContent?.replace(/\s+/g, " ").trim() || "",
        text: item.querySelector(".product-marketing-copy__description")?.textContent?.replace(/\s+/g, " ").trim() || "",
      })).filter((feature) => feature.image && feature.title && feature.text),
    }));
    const finalUrl = page.url();
    const productCode = productCodeFromUrl(finalUrl) || productCodeFromUrl(input);
    if (!productCode || !raw.name) throw new AppError("Philips Hue ürün bilgileri alınamadı.", "PRODUCT_DATA_MISSING");
    await progress("EXTRACTING_IMAGES", "Philips Hue ürün görselleri aranıyor", 36);
    const seen = new Set<string>();
    const images: IkeaProductImage[] = [];
    for (const rawUrl of raw.images) {
      const url = canonicalizePhilipsHueImage(rawUrl);
      if (!url) continue;
      const key = new URL(url).pathname.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      images.push({ url, width: PHILIPS_HUE_IMAGE_WIDTH, height: PHILIPS_HUE_IMAGE_HEIGHT, order: images.length });
      if (images.length >= 20) break;
    }
    if (!images.length) throw new AppError("Bu Philips Hue ürünü için görsel bulunamadı.", "NO_IMAGES");
    const features: PhilipsFeature[] = raw.features.flatMap((feature) => {
      const imageUrl = canonicalizePhilipsHueImage(feature.image);
      return imageUrl ? [{ imageUrl, title: feature.title, text: feature.text }] : [];
    });
    return { brand: "philips-hue", productCode, modelName: raw.name, fullName: raw.name, sourceUrl: finalUrl, images, features };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (signal?.aborted) throw new DOMException("İşlem durduruldu.", "AbortError");
    if (error instanceof Error && error.message.includes("Executable doesn't exist")) {
      throw new AppError("Playwright tarayıcısı bulunamadı. Lütfen uygulamayı kapatıp baslat.bat dosyasını yeniden açın.", "PLAYWRIGHT_BROWSER_MISSING", { cause: error });
    }
    throw new AppError("Philips Hue ürün sayfası işlenemedi.", "SCRAPE_FAILED", { cause: error });
  } finally {
    signal?.removeEventListener("abort", abort);
    await browser?.close();
  }
}
