import { createWriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import { AppError, friendlyError } from "@/lib/errors";
import type { JobEvent, JobRecord, JobStage, OutputImage } from "@/types";
import { scrapeIkeaProduct } from "@/services/ikea/ikeaScraper";
import { codeDigits } from "@/services/ikea/productCode";
import { downloadImages } from "@/services/images/downloader";
import { generateCover, generateGalleryImage } from "@/services/images/imageProcessor";
import { emitJobEvent } from "./jobEvents";
import { jobStorage } from "@/services/storage/localStorage";
import { readSettings, settingsToTemplate } from "@/services/settings/settingsService";
import { createProductVideo } from "@/services/video/videoCreator";

const brandingDir = path.join(process.cwd(), "public", "branding");

async function createZip(outputDir: string, zipPath: string) {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath); const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve); output.on("error", reject); archive.on("error", reject);
    archive.pipe(output); archive.directory(outputDir, false); void archive.finalize();
  });
}

export async function createJob(input: string): Promise<JobRecord> {
  await jobStorage.cleanup();
  const now = new Date().toISOString();
  const job: JobRecord = { jobId: randomUUID(), input, status: "queued", stage: "VALIDATING_INPUT", progress: 2, message: "Merkezi kuyrukta bekliyor", createdAt: now, updatedAt: now, outputs: [] };
  await jobStorage.createJob(job); return job;
}

export async function runJob(jobId: string) {
  let job = await jobStorage.readJob(jobId); if (!job) return;
  const update = async (stage: JobStage, message: string, progress: number) => {
    job = { ...job!, status: stage === "COMPLETED" ? "completed" : stage === "ERROR" ? "failed" : "processing", stage, message, progress, updatedAt: new Date().toISOString() };
    await jobStorage.writeJob(job); const event: JobEvent = { jobId, stage, message, progress, timestamp: job.updatedAt }; emitJobEvent(event);
  };
  try {
    await update("VALIDATING_INPUT", "Girdi doğrulandı", 5);
    const product = await scrapeIkeaProduct(job.input, (stage, message, progress) => { void update(stage, message, progress); });
    job.product = product; await jobStorage.writeJob(job);
    await update("EXTRACTING_IMAGES", `${product.images.length} ürün görseli bulundu`, 42);
    await update("DOWNLOADING_IMAGES", "Görseller indiriliyor", 48);
    const paths = jobStorage.paths(jobId); const downloaded = await downloadImages(product.images.map((image) => image.url), paths.source);
    const prefix = codeDigits(product.productCode); const outputs: OutputImage[] = [];
    await update("PROCESSING_COVER", "Kapak görseli hazırlanıyor", 62);
    const coverName = `${prefix}_01.jpg`; const settings = await readSettings();
    await generateCover(downloaded[0], path.join(paths.output, coverName), product.modelName, product.productCode, brandingDir, settingsToTemplate(settings), settings.jpegQuality);
    outputs.push({ id: "01", filename: coverName, width: 750, height: 1000, isCover: true });
    await update("PROCESSING_GALLERY", "Galeri görselleri hazırlanıyor", 70);
    for (let index = 1; index < downloaded.length; index++) {
      const id = String(index + 1).padStart(2, "0"); const filename = `${prefix}_${id}.jpg`;
      await generateGalleryImage(downloaded[index], path.join(paths.output, filename), settings.backgroundColor, settings.jpegQuality); outputs.push({ id, filename, width: 750, height: 1000, isCover: false });
      await update("PROCESSING_GALLERY", `${index + 1}/${downloaded.length} görsel hazırlandı`, 70 + Math.round(((index + 1) / downloaded.length) * 17));
    }
    job.outputs = outputs; await jobStorage.writeJob(job);
    await update("CREATING_VIDEO", `${settings.videoDurationSeconds} saniyelik ürün videosu hazırlanıyor`, 90);
    const videoName = `${prefix}_video.mp4`;
    await createProductVideo(outputs.map((output) => path.join(paths.output, output.filename)), path.join(paths.output, videoName), settings.videoDurationSeconds);
    job.video = { filename: videoName, width: 750, height: 1000, durationSeconds: settings.videoDurationSeconds }; await jobStorage.writeJob(job);
    await update("CREATING_ZIP", "Medya ZIP arşivi oluşturuluyor", 96); await createZip(paths.output, paths.zip);
    await update("COMPLETED", `${outputs.length} görsel ve video başarıyla oluşturuldu`, 100);
  } catch (error) {
    console.error(`[job:${jobId}]`, error);
    const message = friendlyError(error); job.error = error instanceof AppError ? error.code : "UNEXPECTED"; await update("ERROR", message, job.progress);
  }
}
