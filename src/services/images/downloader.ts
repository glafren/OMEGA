import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "@/config/app-config";
import { AppError } from "@/lib/errors";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadOne(url: string, destination: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { "user-agent": "Mozilla/5.0 OMEGA-Operations/1.0", accept: "image/avif,image/webp,image/*" } });
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

async function downloadWithRetry(url: string, destination: string, signal?: AbortSignal) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await downloadOne(url, destination, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt < 3) await wait(attempt * 750);
    }
  }
  throw lastError;
}

export async function downloadImages(urls: string[], sourceDir: string, signal?: AbortSignal): Promise<string[]> {
  const output: Array<string | undefined> = new Array(urls.length);
  const failures: Array<{ index: number; error: unknown }> = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      if (signal?.aborted) throw new DOMException("İşlem durduruldu.", "AbortError");
      const index = cursor++;
      const destination = path.join(sourceDir, `${String(index + 1).padStart(2, "0")}.source`);
      try { await downloadWithRetry(urls[index], destination, signal); output[index] = destination; } catch (error) { if (signal?.aborted) throw error; failures.push({ index, error }); console.error(`[image:${index}]`, error); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(appConfig.maxConcurrentDownloads, urls.length) }, worker));
  if (failures.length) throw new AppError(`${failures.length} ürün görseli indirilemedi. Lütfen tekrar deneyin.`, "DOWNLOAD_FAILED", { cause: failures[0].error });
  const successful = output.filter((item): item is string => Boolean(item));
  if (!successful.length) throw new AppError("Ürün görselleri indirilemedi.", "DOWNLOAD_FAILED");
  return successful;
}
