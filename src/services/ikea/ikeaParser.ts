import type { Page } from "playwright";
import type { RawProductData } from "./types";

type JsonValue = Record<string, unknown>;

function collectJsonLd(value: unknown, data: RawProductData) {
  if (Array.isArray(value)) return value.forEach((item) => collectJsonLd(item, data));
  if (!value || typeof value !== "object") return;
  const object = value as JsonValue;
  const type = object["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
    if (typeof object.name === "string") data.name ||= object.name;
    if (typeof object.sku === "string") data.code ||= object.sku;
    const images = Array.isArray(object.image) ? object.image : [object.image];
    for (const image of images) {
      if (typeof image === "string") data.images.push({ url: image });
      else if (image && typeof image === "object" && typeof (image as JsonValue).url === "string") data.images.push({ url: String((image as JsonValue).url) });
    }
  }
  Object.values(object).forEach((child) => collectJsonLd(child, data));
}

export async function parseProductPage(page: Page): Promise<RawProductData> {
  return page.evaluate(() => {
    const data: RawProductData = { images: [] };
    const add = (url?: string | null, width?: number, height?: number) => { if (url?.startsWith("http")) data.images.push({ url, width, height }); };
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== "object") return;
      const item = value as Record<string, unknown>;
      const type = item["@type"];
      if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
        if (typeof item.name === "string") data.name ||= item.name;
        if (typeof item.sku === "string") data.code ||= item.sku;
        const values = Array.isArray(item.image) ? item.image : [item.image];
        values.forEach((value) => {
          if (typeof value === "string") add(value);
          else if (value && typeof value === "object") add(String((value as Record<string, unknown>).url || ""));
        });
      }
      Object.values(item).forEach(walk);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => { try { walk(JSON.parse(script.textContent || "")); } catch {} });
    const meta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content;
    data.name ||= meta('meta[property="og:title"]') || document.querySelector("h1")?.textContent?.trim();
    add(meta('meta[property="og:image"]'));
    document.querySelectorAll<HTMLImageElement>("main img, [data-testid*=gallery] img, picture img").forEach((img) => {
      const sources = [img.currentSrc, img.src, img.dataset.src];
      sources.forEach((url) => add(url, img.naturalWidth || undefined, img.naturalHeight || undefined));
      [img.srcset, img.dataset.srcset].filter(Boolean).forEach((srcset) => {
        srcset!.split(",").forEach((part) => add(part.trim().split(/\s+/)[0]));
      });
      img.closest("picture")?.querySelectorAll<HTMLSourceElement>("source").forEach((source) => source.srcset.split(",").forEach((part) => add(part.trim().split(/\s+/)[0])));
    });
    // Some country sites serialize the full gallery while rendering only the first lazy image.
    const serialized = document.documentElement.innerHTML.replaceAll("\\/", "/");
    const ikeaGalleryUrls = serialized.match(/https?:\/\/[^"'\\s]+\/urunler\/2000_2000\/[^"'\\s]+?\.(?:jpe?g|png|webp)/gi) || [];
    ikeaGalleryUrls.forEach((url) => add(url.replace(/&amp;/g, "&"), 2000, 2000));
    const body = document.body.innerText;
    data.code ||= body.match(/\b\d{3}[.]\d{3}[.]\d{2}\b/)?.[0];
    return data;
  });
}

// Exported for focused parser tests and future non-browser adapters.
export { collectJsonLd };
