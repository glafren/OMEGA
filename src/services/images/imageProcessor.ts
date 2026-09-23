import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { appConfig } from "@/config/app-config";
import { defaultTemplate, type ImageTemplateConfig } from "@/config/image-template";
import { centeredPlacement } from "@/lib/image-layout";
import { textLayer } from "./textRenderer";

async function containedBuffer(sourcePath: string, area: { x: number; y: number; width: number; height: number }, options: { trimWhitespace?: boolean; enlarge?: boolean } = {}) {
  let buffer = await sharp(sourcePath, { failOn: "warning", limitInputPixels: 80_000_000 }).rotate().flatten({ background: "#FFFFFF" }).toColourspace("srgb").png().toBuffer();
  if (options.trimWhitespace) buffer = await sharp(buffer).trim({ background: "#FFFFFF", threshold: 16 }).png().toBuffer();
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Görsel boyutları okunamadı");
  const placement = centeredPlacement(metadata.width, metadata.height, area.x, area.y, area.width, area.height);
  const input = await sharp(buffer).resize(placement.width, placement.height, { fit: "contain", withoutEnlargement: !options.enlarge, background: "#FFFFFF" }).flatten({ background: "#FFFFFF" }).toColourspace("srgb").toBuffer();
  const resizedMeta = await sharp(input).metadata();
  return { input, left: Math.round(area.x + (area.width - (resizedMeta.width || placement.width)) / 2), top: Math.round(area.y + (area.height - (resizedMeta.height || placement.height)) / 2) };
}

async function trimmedContainBuffer(sourcePath: string, width: number, height: number) {
  let buffer = await sharp(sourcePath, { failOn: "warning", limitInputPixels: 80_000_000 }).rotate().flatten({ background: "#FFFFFF" }).toColourspace("srgb").png().toBuffer();
  buffer = await sharp(buffer).trim({ background: "#FFFFFF", threshold: 16 }).png().toBuffer();
  return sharp(buffer).resize(width, height, { fit: "contain", withoutEnlargement: false, background: "#FFFFFF" }).flatten({ background: "#FFFFFF" }).toColourspace("srgb").toBuffer();
}

async function logoLayer(file: string, width: number, maxHeight: number, x: number, y: number) {
  const buffer = await sharp(file).resize({ width, height: maxHeight, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return { input: buffer, left: x, top: y };
}

export async function generateCover(sourcePath: string, destination: string, modelName: string, productCode: string, brandingDir: string, config: ImageTemplateConfig = defaultTemplate, quality = appConfig.jpegQuality) {
  const product = config.product;
  const productLayer = await containedBuffer(sourcePath, { x: product.areaX + product.padding, y: product.areaY + product.padding, width: product.areaWidth - product.padding * 2, height: product.areaHeight - product.padding * 2 }, { trimWhitespace: true, enlarge: true });
  const ikea = await logoLayer(path.join(brandingDir, "ikea-logo.png"), config.ikeaLogo.width, config.ikeaLogo.maxHeight, config.ikeaLogo.x, config.ikeaLogo.y);
  const store = await logoLayer(path.join(brandingDir, "store-logo.png"), config.storeLogo.width, config.storeLogo.maxHeight, config.storeLogo.x, config.storeLogo.y);
  let embeddedFont: { base64: string; format: "opentype" | "truetype" } | undefined;
  for (const [filename, format] of [["Montserrat-Bold.ttf", "truetype"]] as const) {
    try { embeddedFont = { base64: (await readFile(path.join(process.cwd(), "public", "fonts", filename))).toString("base64"), format }; break; } catch {}
  }
  const text = textLayer(modelName, productCode, { width: config.canvasWidth, height: config.canvasHeight, nameX: config.productName.x, nameY: config.productName.y, nameMaxWidth: config.productName.maxWidth, nameFontSize: config.productName.fontSize, nameMinSize: config.productName.minFontSize, nameFontWeight: config.productName.fontWeight, nameFontFamily: config.productName.fontFamily, nameColor: config.productName.color, shadowAngle: config.productName.shadow.angle, shadowDistance: config.productName.shadow.distance, shadowOpacity: config.productName.shadow.opacity, embeddedFont, codeX: config.productCode.x, codeY: config.productCode.y, codeFontSize: config.productCode.fontSize, codeFontWeight: config.productCode.fontWeight, codeFontFamily: config.productCode.fontFamily, codeColor: config.productCode.color });
  await sharp({ create: { width: config.canvasWidth, height: config.canvasHeight, channels: 3, background: config.backgroundColor } }).composite([productLayer, ikea, store, { input: text, left: 0, top: 0 }]).jpeg({ quality, chromaSubsampling: "4:4:4" }).toFile(destination);
}

export async function generateGalleryImage(sourcePath: string, destination: string, background = "#FFFFFF", quality = appConfig.jpegQuality) {
  const input = await trimmedContainBuffer(sourcePath, 750, 1000);
  await sharp({ create: { width: 750, height: 1000, channels: 3, background } }).composite([{ input, left: 0, top: 0 }]).jpeg({ quality, chromaSubsampling: "4:4:4" }).toFile(destination);
}
