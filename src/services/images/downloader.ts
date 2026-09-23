import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "@/config/app-config";
import { AppError } from "@/lib/errors";

async function downloadOne(url: string, destination: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "Mozilla/5.0 IKEA-Ozon-Studio/1.0", accept: "image/avif,image/webp,image/*" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error("Yanıt görsel değil");
  const declared = Number(response.headers.get("content-length"));
  if (declared > appConfig.maxImageBytes) throw new Error("Görsel çok büyük");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > appConfig.maxImageBytes) throw new Error("Görsel çok büyük");
  await writeFile(destination, buffer);
  return createHash("sha256").update(buffer).digest("hex");
}

export async function downloadImages(urls: string[], sourceDir: string): Promise<string[]> {
  const output: Array<string | undefined> = new Array(urls.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      const destination = path.join(sourceDir, `${String(index + 1).padStart(2, "0")}.source`);
      try { await downloadOne(urls[index], destination); output[index] = destination; } catch (error) { console.error(`[image:${index}]`, error); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(appConfig.maxConcurrentDownloads, urls.length) }, worker));
  const successful = output.filter((item): item is string => Boolean(item));
  if (!successful.length) throw new AppError("Ürün görselleri indirilemedi.", "DOWNLOAD_FAILED");
  return successful;
}
