import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import { AppError, friendlyError } from "@/lib/errors";
import type { IkeaProduct, JobEvent, JobRecord, JobStage, OutputImage, ProductBrand } from "@/types";
import { scrapeIkeaProduct } from "@/services/ikea/ikeaScraper";
import { scrapePhilipsProduct } from "@/services/philips/philipsScraper";
import { scrapePhilipsHueProduct } from "@/services/philips-hue/philipsHueScraper";
import { codeDigits } from "@/services/ikea/productCode";
import { downloadImages } from "@/services/images/downloader";
import { generateCover, generateGalleryImage } from "@/services/images/imageProcessor";
import { brandClosingImageFilename } from "@/services/images/brandClosingImage";
import { emitJobEvent } from "./jobEvents";
import { jobStorage } from "@/services/storage/localStorage";
import { readSettings, settingsToTemplate } from "@/services/settings/settingsService";
import { createProductVideo } from "@/services/video/videoCreator";
import { createPhilipsRichContent } from "@/services/philips/richContent";
import { createIkeaRichContent, countRichContentBlocks } from "@/services/ikea/richContent";
import { generateIkeaRichContentCopy } from "@/services/openai/richContentCopy";

const brandingDir = path.join(process.cwd(), "public", "branding");
const abortError = () => new DOMException("İşlem durduruldu.", "AbortError");

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

async function createZip(outputDir: string, zipPath: string) {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath); const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve); output.on("error", reject); archive.on("error", reject);
    archive.pipe(output); archive.directory(outputDir, false); void archive.finalize();
  });
}

async function generateRichContent(product: IkeaProduct) {
  if (product.brand === "philips" || product.brand === "philips-hue") {
    const content = await createPhilipsRichContent(product.features || []);
    return { content, blockCount: product.features?.length || 0, modelUsage: {} };
  }
  const generated = await generateIkeaRichContentCopy(product);
  const content = createIkeaRichContent(product, generated.copy);
  return { content, blockCount: countRichContentBlocks(content), modelUsage: { model: generated.model, ...generated.usage } };
}

export async function createJob(input: string, brand: ProductBrand = "ikea"): Promise<JobRecord> {
  await jobStorage.cleanup();
  const now = new Date().toISOString();
  const job: JobRecord = { jobId: randomUUID(), input, brand, status: "queued", stage: "VALIDATING_INPUT", progress: 2, message: "Merkezi kuyrukta bekliyor", createdAt: now, updatedAt: now, outputs: [] };
  await jobStorage.createJob(job); return job;
}

export async function runJob(jobId: string, signal?: AbortSignal) {
  let job = await jobStorage.readJob(jobId); if (!job) return;
  const update = async (stage: JobStage, message: string, progress: number) => {
    job = { ...job!, status: stage === "COMPLETED" ? "completed" : stage === "ERROR" ? "failed" : "processing", stage, message, progress, updatedAt: new Date().toISOString() };
    await jobStorage.writeJob(job); const event: JobEvent = { jobId, stage, message, progress, timestamp: job.updatedAt }; emitJobEvent(event);
  };
  const cancel = async () => {
    job = { ...job!, status: "canceled", stage: "ERROR", message: "İşlem durduruldu.", progress: job!.progress, updatedAt: new Date().toISOString(), error: "CANCELED" };
    await jobStorage.writeJob(job);
    emitJobEvent({ jobId, stage: "ERROR", message: job.message, progress: job.progress, timestamp: job.updatedAt });
  };
  try {
    throwIfAborted(signal);
    await update("VALIDATING_INPUT", "Girdi doğrulandı", 5);
    const brand = job.brand || "ikea";
    const scraper = brand === "philips" ? scrapePhilipsProduct : brand === "philips-hue" ? scrapePhilipsHueProduct : scrapeIkeaProduct;
    const product = await scraper(job.input, update, signal);
    throwIfAborted(signal);
    job.product = product; await jobStorage.writeJob(job);
    await update("EXTRACTING_IMAGES", `${product.images.length} ürün görseli bulundu`, 42);
    await update("DOWNLOADING_IMAGES", "Görseller indiriliyor", 48);
    const paths = jobStorage.paths(jobId); const downloaded = await downloadImages(product.images.map((image) => image.url), paths.source, signal);
    throwIfAborted(signal);
    const prefix = brand === "ikea" ? codeDigits(product.productCode) : product.productCode.replace(/[^a-z0-9]+/gi, "").toUpperCase(); const outputs: OutputImage[] = [];
    await update("PROCESSING_COVER", "Kapak görseli hazırlanıyor", 62);
    const coverName = `${prefix}_01.jpg`; const settings = await readSettings();
    await generateCover(downloaded[0], path.join(paths.output, coverName), product.modelName, product.productCode, brandingDir, settingsToTemplate(settings), settings.jpegQuality, brand);
    throwIfAborted(signal);
    outputs.push({ id: "01", filename: coverName, width: 750, height: 1000, isCover: true });
    await update("PROCESSING_GALLERY", "Galeri görselleri hazırlanıyor", 70);
    for (let index = 1; index < downloaded.length; index++) {
      throwIfAborted(signal);
      const id = String(index + 1).padStart(2, "0"); const filename = `${prefix}_${id}.jpg`;
      await generateGalleryImage(downloaded[index], path.join(paths.output, filename), settings.backgroundColor, settings.jpegQuality); outputs.push({ id, filename, width: 750, height: 1000, isCover: false });
      await update("PROCESSING_GALLERY", `${index + 1}/${downloaded.length} görsel hazırlandı`, 70 + Math.round(((index + 1) / downloaded.length) * 17));
    }
    throwIfAborted(signal);
    await update("PROCESSING_GALLERY", "Marka kapanış görseli hazırlanıyor", 87);
    const closingId = String(downloaded.length + 1).padStart(2, "0"); const closingName = `${prefix}_${closingId}.jpg`;
    await generateGalleryImage(path.join(brandingDir, brandClosingImageFilename(brand)), path.join(paths.output, closingName), settings.backgroundColor, settings.jpegQuality);
    outputs.push({ id: closingId, filename: closingName, width: 750, height: 1000, isCover: false });
    job.outputs = outputs; await jobStorage.writeJob(job);
    await update("CREATING_VIDEO", `${settings.videoDurationSeconds} saniyelik ürün videosu hazırlanıyor`, 90);
    const videoName = `${prefix}_video.mp4`;
    await createProductVideo(outputs.map((output) => path.join(paths.output, output.filename)), path.join(paths.output, videoName), settings.videoDurationSeconds, signal);
    throwIfAborted(signal);
    job.video = { filename: videoName, width: 750, height: 1000, durationSeconds: settings.videoDurationSeconds }; await jobStorage.writeJob(job);
    await update("CREATING_RICH_CONTENT", "Rusça Ozon Rich Content hazırlanıyor", 95);
    job.richContentStatus = "processing"; job.richContentError = undefined; await jobStorage.writeJob(job);
    try {
      const generated = await generateRichContent(product);
      const filename = `${prefix}_rich-content.json`;
      await writeFile(path.join(paths.output, filename), JSON.stringify(generated.content, null, 2), "utf8");
      job.richContent = { filename, blockCount: generated.blockCount, language: "ru", ...generated.modelUsage };
      job.richContentStatus = "completed"; job.richContentError = undefined; await jobStorage.writeJob(job);
    } catch (error) {
      console.error(`[job:${jobId}:rich-content]`, error);
      job.richContentStatus = "failed"; job.richContentError = friendlyError(error); await jobStorage.writeJob(job);
    }
    await update("CREATING_ZIP", "Medya ZIP arşivi oluşturuluyor", 98); await createZip(paths.output, paths.zip);
    throwIfAborted(signal);
    await update("COMPLETED", `${outputs.length} görsel ve video başarıyla oluşturuldu${job.richContent ? "; Rich Content JSON hazır" : job.richContentStatus === "failed" ? "; Rich Content tekrar denenebilir" : ""}`, 100);
  } catch (error) {
    console.error(`[job:${jobId}]`, error);
    if (error instanceof DOMException && error.name === "AbortError") {
      await cancel();
      return;
    }
    const message = friendlyError(error); job.error = error instanceof AppError ? error.code : "UNEXPECTED"; await update("ERROR", message, job.progress);
  }
}

export async function retryRichContent(jobId: string) {
  let job = await jobStorage.readJob(jobId);
  if (!job) throw new AppError("İş bulunamadı.", "JOB_NOT_FOUND");
  if (!job.product || !job.outputs.length) throw new AppError("Rich Content için hazırlanmış ürün verisi bulunamadı.", "RICH_CONTENT_RETRY_UNAVAILABLE");
  if (job.richContentStatus === "processing") throw new AppError("Rich Content zaten hazırlanıyor.", "RICH_CONTENT_IN_PROGRESS");
  const product = job.product;

  job = { ...job, richContentStatus: "processing", richContentError: undefined, updatedAt: new Date().toISOString() };
  await jobStorage.writeJob(job);
  try {
    const generated = await generateRichContent(product);
    const prefix = product.brand === "ikea" ? codeDigits(product.productCode) : product.productCode.replace(/[^a-z0-9]+/gi, "").toUpperCase();
    const filename = `${prefix}_rich-content.json`;
    const paths = jobStorage.paths(jobId);
    await writeFile(path.join(paths.output, filename), JSON.stringify(generated.content, null, 2), "utf8");
    await createZip(paths.output, paths.zip);
    const recovered = job.status === "failed" && job.error === "TRANSLATION_FAILED";
    job = {
      ...job,
      status: recovered ? "completed" : job.status,
      stage: recovered ? "COMPLETED" : job.stage,
      progress: recovered ? 100 : job.progress,
      message: recovered ? `${job.outputs.length} görsel, video ve Rich Content JSON başarıyla oluşturuldu` : job.message,
      richContent: { filename, blockCount: generated.blockCount, language: "ru", ...generated.modelUsage },
      richContentStatus: "completed",
      richContentError: undefined,
      error: recovered ? undefined : job.error,
      updatedAt: new Date().toISOString(),
    };
    await jobStorage.writeJob(job);
    return job;
  } catch (error) {
    job = { ...job, richContentStatus: "failed", richContentError: friendlyError(error), updatedAt: new Date().toISOString() };
    await jobStorage.writeJob(job);
    throw error;
  }
}

export async function cancelJob(jobId: string) {
  const job = await jobStorage.readJob(jobId);
  if (!job || job.status === "completed" || job.status === "failed" || job.status === "canceled") return job;
  const updated: JobRecord = { ...job, status: "canceled", stage: "ERROR", message: "İşlem durduruldu.", error: "CANCELED", updatedAt: new Date().toISOString() };
  await jobStorage.writeJob(updated);
  emitJobEvent({ jobId, stage: "ERROR", message: updated.message, progress: updated.progress, timestamp: updated.updatedAt });
  return updated;
}
