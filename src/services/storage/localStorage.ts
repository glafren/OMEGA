import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "@/config/app-config";
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
  async writeJob(job: JobRecord) { const paths = this.paths(job.jobId); await mkdir(paths.root, { recursive: true }); await writeFile(paths.metadata, JSON.stringify(job, null, 2)); }
  async cleanup() {
    await mkdir(this.basePath, { recursive: true });
    const entries = await readdir(this.basePath, { withFileTypes: true }); const cutoff = Date.now() - appConfig.retentionHours * 3_600_000;
    await Promise.all(entries.filter((item) => item.isDirectory()).map(async (item) => { const target = path.join(this.basePath, item.name); try { if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true }); } catch {} }));
  }
}

export const jobStorage = new LocalJobStorage();
