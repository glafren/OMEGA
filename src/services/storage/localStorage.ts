import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { appConfig } from "@/config/app-config";
import { AppError } from "@/lib/errors";
import { assertSafeId } from "@/lib/validation";
import type { JobRecord } from "@/types";
import type { JobPaths, StorageAdapter } from "./storage";

export class LocalJobStorage implements StorageAdapter {
  constructor(private readonly basePath = appConfig.jobStoragePath) {}
  paths(jobId: string): JobPaths {
    const root = path.join(this.basePath, assertSafeId(jobId));
    return { root, source: path.join(root, "source"), output: path.join(root, "output"), metadata: path.join(root, "metadata.json"), zip: path.join(root, "result.zip") };
  }
  async createJob(job: JobRecord) { const paths = this.paths(job.jobId); await mkdir(paths.source, { recursive: true }); await mkdir(paths.output, { recursive: true }); await this.writeJob(job); return paths; }
  async readJob(jobId: string) { try { return JSON.parse(await readFile(this.paths(jobId).metadata, "utf8")) as JobRecord; } catch { return null; } }
  async writeJob(job: JobRecord) {
    const paths = this.paths(job.jobId);
    const temporaryPath = `${paths.metadata}.${randomUUID()}.tmp`;
    await mkdir(paths.root, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(job, null, 2));
    try {
      // Windows readers and sync clients can briefly lock the destination.
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temporaryPath, paths.metadata);
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!["EPERM", "EACCES", "EBUSY"].includes(code || "") || attempt >= 5) throw error;
          await wait(50 * (2 ** attempt));
        }
      }
    } catch (error) {
      throw new AppError("İşlem kaydı dosyasına yazılamadı. Dosya başka bir uygulama tarafından kullanılıyor olabilir; lütfen tekrar deneyin.", "JOB_STORAGE_WRITE_FAILED", { cause: error });
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
  async cleanup() {
    await mkdir(this.basePath, { recursive: true });
    const entries = await readdir(this.basePath, { withFileTypes: true }); const cutoff = Date.now() - appConfig.retentionHours * 3_600_000;
    await Promise.all(entries.filter((item) => item.isDirectory()).map(async (item) => { const target = path.join(this.basePath, item.name); try { if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true }); } catch {} }));
  }
}

export const jobStorage = new LocalJobStorage();
