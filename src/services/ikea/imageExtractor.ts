import type { IkeaProductImage } from "@/types";

const BLOCKED = /(?:logo|icon|sprite|payment|flag|avatar|favicon|transparent|placeholder)/i;

function upgradeIkeaImage(url: string): string {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    parsed.searchParams.delete("f");
    parsed.searchParams.delete("w");
    parsed.searchParams.delete("h");
    return parsed.toString();
  } catch { return ""; }
}

export function deduplicateImageUrls(items: Array<{ url: string; width?: number; height?: number }>): IkeaProductImage[] {
  const seen = new Map<string, number>();
  const result: IkeaProductImage[] = [];
  for (const item of items) {
    const url = upgradeIkeaImage(item.url);
    if (!url || BLOCKED.test(new URL(url).pathname)) continue;
    const key = url.replace(/\?.*$/, "").replace(/\/\d{2,4}_\d{2,4}\//, "/SIZE/").replace(/[_-](?:s\d+|t\d+|small|thumb)(?=\.)/i, "").toLowerCase();
    const existing = seen.get(key);
    if (existing !== undefined) {
      const score = Number(url.match(/\/(\d{2,4})_\d{2,4}\//)?.[1] || item.width || 0);
      const old = result[existing]; const oldScore = Number(old.url.match(/\/(\d{2,4})_\d{2,4}\//)?.[1] || old.width || 0);
      if (score > oldScore) result[existing] = { url, width: item.width, height: item.height, order: old.order };
      continue;
    }
    seen.set(key, result.length);
    result.push({ url, width: item.width, height: item.height, order: result.length });
  }
  return result;
}
