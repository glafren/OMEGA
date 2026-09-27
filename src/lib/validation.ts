import { z } from "zod";

const IKEA_HOST = /(^|\.)ikea\.(com(\.tr)?|[a-z]{2,3})$/i;
const PHILIPS_HOST = /(^|\.)philips\.com\.tr$/i;
export const productCodePattern = /^\d{3}[. ]?\d{3}[. ]?\d{2}$/;

export function normalizeProductCode(input: string): string | null {
  const digits = input.trim().replace(/[.\s-]/g, "");
  return /^\d{8}$/.test(digits) ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}` : null;
}

export function isAllowedIkeaUrl(input: string): boolean {
  try { const url = new URL(input); return url.protocol === "https:" && !url.port && IKEA_HOST.test(url.hostname); }
  catch { return false; }
}

export function isAllowedPhilipsUrl(input: string): boolean {
  try { const url = new URL(input); return url.protocol === "https:" && !url.port && PHILIPS_HOST.test(url.hostname) && url.pathname.toLowerCase().startsWith("/c-p/"); }
  catch { return false; }
}

export const createJobSchema = z.object({ brand: z.enum(["ikea", "philips"]).default("ikea"), input: z.string().trim().min(3).max(2048) }).superRefine(({ brand, input }, ctx) => {
  if (brand === "ikea" && !normalizeProductCode(input) && !isAllowedIkeaUrl(input)) ctx.addIssue({ code: "custom", message: "Geçerli bir IKEA ürün linki veya ürün kodu girin." });
  if (brand === "philips" && !isAllowedPhilipsUrl(input)) ctx.addIssue({ code: "custom", message: "Geçerli bir Philips Türkiye ürün linki girin." });
});

export function assertSafeId(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Geçersiz dosya kimliği");
  return value;
}
