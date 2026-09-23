import { normalizeProductCode } from "@/lib/validation";

export function extractProductCode(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/\b(\d{3})[.\s-]?(\d{3})[.\s-]?(\d{2})\b/);
    if (match) return normalizeProductCode(match[0]);
  }
  return null;
}

export const codeDigits = (code: string) => code.replace(/\D/g, "");
