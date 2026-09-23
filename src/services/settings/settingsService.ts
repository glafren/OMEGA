import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defaultTemplate, type ImageTemplateConfig } from "@/config/image-template";

const settingsPath = path.join(process.cwd(), "tmp", "settings.json");
export const settingsSchema = z.object({
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  productPadding: z.number().int().min(0).max(100),
  ikeaLogoWidth: z.number().int().min(60).max(400),
  storeLogoWidth: z.number().int().min(60).max(400),
  productNameFontSize: z.number().int().min(24).max(72),
  productNameMinFontSize: z.number().int().min(16).max(48),
  productCodeFontSize: z.number().int().min(14).max(40),
  jpegQuality: z.number().int().min(70).max(100),
  videoDurationSeconds: z.number().int().min(10).default(15),
});
export type AppSettings = z.infer<typeof settingsSchema>;
export const defaultSettings: AppSettings = { backgroundColor: "#FFFFFF", productPadding: 12, ikeaLogoWidth: 278, storeLogoWidth: 250, productNameFontSize: 44, productNameMinFontSize: 24, productCodeFontSize: 20, jpegQuality: 92, videoDurationSeconds: 15 };

export async function readSettings(): Promise<AppSettings> { try { return settingsSchema.parse(JSON.parse(await readFile(settingsPath, "utf8"))); } catch { return defaultSettings; } }
export async function writeSettings(input: unknown) { const settings = settingsSchema.parse(input); await mkdir(path.dirname(settingsPath), { recursive: true }); const temp = `${settingsPath}.tmp`; await writeFile(temp, JSON.stringify(settings, null, 2)); await rename(temp, settingsPath); return settings; }
export function settingsToTemplate(settings: AppSettings): ImageTemplateConfig {
  return { ...defaultTemplate, backgroundColor: settings.backgroundColor,
    ikeaLogo: { ...defaultTemplate.ikeaLogo, width: settings.ikeaLogoWidth }, storeLogo: { ...defaultTemplate.storeLogo, width: settings.storeLogoWidth },
    product: { ...defaultTemplate.product, padding: settings.productPadding },
    productName: { ...defaultTemplate.productName, fontSize: settings.productNameFontSize, minFontSize: settings.productNameMinFontSize },
    productCode: { ...defaultTemplate.productCode, fontSize: settings.productCodeFontSize },
  };
}
