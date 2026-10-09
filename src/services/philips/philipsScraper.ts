import { chromium } from "playwright";
import type { Browser } from "playwright";
import { appConfig } from "@/config/app-config";
import { AppError } from "@/lib/errors";
import { isAllowedPhilipsUrl } from "@/lib/validation";
import type { IkeaProduct, IkeaProductImage, PhilipsFeature } from "@/types";
import type { ScrapeProgress } from "@/services/ikea/ikeaScraper";

const PHILIPS_IMAGE_SIZE = 1200;

type PhilipsImageCandidate = {
  src: string;
  isFeature: boolean;
  isProductGallery?: boolean;
};

function productCodeFromUrl(input: string) {
  try {
    const segment = new URL(input).pathname.match(/^\/c-p\/([^/]+)/i)?.[1];
    return segment ? decodeURIComponent(segment).replace(/_/g, "/").toUpperCase() : null;
  } catch { return null; }
}

export function canonicalizePhilipsImage(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "images.philips.com" || !url.pathname.toLowerCase().startsWith("/is/image/philipsconsumer/")) return null;
    return `${url.origin}${url.pathname}?$png$&wid=${PHILIPS_IMAGE_SIZE}&hei=${PHILIPS_IMAGE_SIZE}&fit=constrain`;
  } catch { return null; }
}

export function canonicalizePhilipsFeatureImage(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "images.philips.com" || !url.pathname.toLowerCase().startsWith("/is/image/philipsconsumer/")) return null;
    return `${url.origin}${url.pathname}?$png$&wid=${PHILIPS_IMAGE_SIZE}`;
  } catch { return null; }
}

export function selectPhilipsProductImageUrls(primary: string, candidates: PhilipsImageCandidate[]): string[] {
  const productGalleryCandidates = candidates.filter((candidate) => candidate.isProductGallery);
  const galleryCandidates = productGalleryCandidates.length ? productGalleryCandidates : candidates.filter((candidate) => !candidate.isFeature);
  const urls = [primary, ...galleryCandidates.map((candidate) => candidate.src)]
    .map(canonicalizePhilipsImage)
    .filter((url): url is string => Boolean(url));
  const seen = new Set<string>();
  const images: string[] = [];
  for (const url of urls) {
    const key = new URL(url).pathname.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    images.push(url);
    if (images.length >= 20) break;
  }
  return images;
}

export async function scrapePhilipsProduct(input: string, progress: ScrapeProgress, signal?: AbortSignal): Promise<IkeaProduct> {
  await progress("RESOLVING_PRODUCT", "Philips ürün adresi doğrulanıyor", 10);
  if (!isAllowedPhilipsUrl(input)) throw new AppError("Geçerli bir Philips Türkiye ürün linki girin.", "INVALID_INPUT");
  await progress("OPENING_IKEA_PAGE", "Philips ürün sayfası açılıyor", 18);
  let browser: Browser | undefined;
  const abort = () => { void browser?.close().catch(() => undefined); };
  try {
    browser = await chromium.launch({ headless: true });
    signal?.addEventListener("abort", abort, { once: true });
    const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36" });
    const page = await context.newPage();
    page.setDefaultTimeout(appConfig.playwrightTimeout);
    const response = await page.goto(input, { waitUntil: "domcontentloaded", timeout: appConfig.playwrightTimeout });
    if (!response?.ok() || !isAllowedPhilipsUrl(page.url())) throw new AppError("Philips ürün sayfasına ulaşılamadı.", "PAGE_UNAVAILABLE");
    await page.waitForTimeout(1500);
    if (signal?.aborted) throw new DOMException("İşlem durduruldu.", "AbortError");
    await page.locator("#onetrust-reject-all-handler").click({ timeout: 2_000 }).catch(() => undefined);
    const expandFeatures = page.getByRole("button", { name: /Daha fazla göster/i }).first();
    if (await expandFeatures.count()) {
      await expandFeatures.evaluate((button) => (button as HTMLButtonElement).click()).catch(() => undefined);
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="features"] [data-testid="feature-card"]').length > 3, undefined, { timeout: 5_000 }).catch(() => undefined);
    }
    await progress("EXTRACTING_PRODUCT_DATA", "Philips ürün bilgileri alınıyor", 28);
    const raw = await page.evaluate(() => {
      type JsonObject = Record<string, unknown>;
      const findProduct = (value: unknown): JsonObject | null => {
        if (Array.isArray(value)) { for (const item of value) { const found = findProduct(item); if (found) return found; } return null; }
        if (!value || typeof value !== "object") return null;
        const object = value as JsonObject; const type = object["@type"];
        if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return object;
        for (const child of Object.values(object)) { const found = findProduct(child); if (found) return found; }
        return null;
      };
      let product: JsonObject | null = null;
      document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => { if (product) return; try { product = findProduct(JSON.parse(script.textContent || "")); } catch {} });
      const data = product as JsonObject | null;
      const imageValue = data?.image;
      const primary = typeof imageValue === "string" ? imageValue : Array.isArray(imageValue) && typeof imageValue[0] === "string" ? imageValue[0] : "";
      const images = [...document.querySelectorAll<HTMLImageElement>("img")];
      const primaryPath = primary ? new URL(primary, location.href).pathname : "";
      const productGallery = primaryPath ? [...document.querySelectorAll<HTMLElement>(".swiper")]
        .find((swiper) => [...swiper.querySelectorAll<HTMLImageElement>("img")]
          .some((image) => (image.currentSrc || image.src).includes(primaryPath))) : null;
      const gallery = images.map((image) => ({
        src: image.currentSrc || image.src,
        isFeature: Boolean(image.closest('[data-testid="features"] [data-testid="feature-card"]')),
        isProductGallery: productGallery ? productGallery.contains(image) : false,
      }));
      const features = [...document.querySelectorAll<HTMLElement>('[data-testid="features"] [data-testid="feature-card"]')].map((card) => ({
        image: card.querySelector<HTMLImageElement>("img")?.currentSrc || card.querySelector<HTMLImageElement>("img")?.src || "",
        title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
        text: card.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim() || "",
      })).filter((feature) => feature.image && feature.title && feature.text);
      return { name: typeof data?.name === "string" ? data.name : document.querySelector("h1")?.textContent?.trim(), code: typeof data?.sku === "string" ? data.sku : "", primary, gallery, features };
    });
    const finalUrl = page.url();
    const productCode = raw.code.trim() || productCodeFromUrl(finalUrl) || productCodeFromUrl(input);
    const fullName = raw.name?.replace(/\s+/g, " ").trim();
    if (!productCode || !fullName) throw new AppError("Philips ürün bilgileri alınamadı.", "PRODUCT_DATA_MISSING");
    await progress("EXTRACTING_IMAGES", "Philips ürün görselleri aranıyor", 36);
    const images: IkeaProductImage[] = selectPhilipsProductImageUrls(raw.primary, raw.gallery)
      .map((url, order) => ({ url, width: PHILIPS_IMAGE_SIZE, height: PHILIPS_IMAGE_SIZE, order }));
    if (!images.length) throw new AppError("Bu Philips ürünü için görsel bulunamadı.", "NO_IMAGES");
    const features: PhilipsFeature[] = raw.features.flatMap((feature) => {
      const imageUrl = canonicalizePhilipsFeatureImage(feature.image);
      return imageUrl ? [{ imageUrl, title: feature.title, text: feature.text }] : [];
    });
    return { brand: "philips", productCode, modelName: fullName, fullName, sourceUrl: finalUrl, images, features };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (signal?.aborted) throw new DOMException("İşlem durduruldu.", "AbortError");
    if (error instanceof Error && error.message.includes("Executable doesn't exist")) {
      throw new AppError("Playwright tarayıcısı bulunamadı. Lütfen uygulamayı kapatıp baslat.bat dosyasını yeniden açın.", "PLAYWRIGHT_BROWSER_MISSING", { cause: error });
    }
    throw new AppError("Philips ürün sayfası işlenemedi.", "SCRAPE_FAILED", { cause: error });
  } finally { signal?.removeEventListener("abort", abort); await browser?.close(); }
}
