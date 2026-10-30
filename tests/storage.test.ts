import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalJobStorage } from "@/services/storage/localStorage";
import type { JobRecord } from "@/types";

const lock = vi.hoisted(() => ({ remaining: 0, code: "EPERM" }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: vi.fn(async (...args: Parameters<typeof actual.rename>) => {
      if (lock.remaining-- > 0) throw Object.assign(new Error("File locked"), { code: lock.code });
      return actual.rename(...args);
    }),
  };
});

describe("job metadata storage", () => {
  let directory: string;
  let storage: LocalJobStorage;
  let job: JobRecord;

  beforeEach(async () => {
    lock.remaining = 0;
    lock.code = "EPERM";
    directory = await mkdtemp(path.join(tmpdir(), "omega-storage-"));
    storage = new LocalJobStorage(directory);
    job = { jobId: "879b7202-32a3-4424-be5e-be419c4f67a8", input: "test", brand: "ikea", status: "processing", stage: "EXTRACTING_IMAGES", progress: 42, message: "Images found", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), outputs: [] };
    await storage.createJob(job);
    vi.mocked(rename).mockClear();
  });

  afterEach(async () => {
    lock.remaining = 0;
    await rm(directory, { recursive: true, force: true });
  });

  it.each(["EPERM", "EACCES", "EBUSY"])("retries a temporary %s lock and saves readable metadata", async (code) => {
    lock.code = code;
    lock.remaining = 2;
    const updated: JobRecord = { ...job, stage: "DOWNLOADING_IMAGES", progress: 48 };
    await storage.writeJob(updated);
    expect(await storage.readJob(job.jobId)).toEqual(updated);
    expect(rename).toHaveBeenCalledTimes(3);
    expect((await readdir(storage.paths(job.jobId).root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("preserves the last valid metadata and cleans temporary files when the lock persists", async () => {
    lock.remaining = 20;
    await expect(storage.writeJob({ ...job, progress: 48 })).rejects.toMatchObject({ code: "JOB_STORAGE_WRITE_FAILED", cause: { code: "EPERM" } });
    expect(rename).toHaveBeenCalledTimes(6);
    expect(await storage.readJob(job.jobId)).toEqual(job);
    expect((await readdir(storage.paths(job.jobId).root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("does not retry unrelated filesystem errors", async () => {
    lock.remaining = 1;
    lock.code = "ENOENT";
    await expect(storage.writeJob(job)).rejects.toMatchObject({ code: "JOB_STORAGE_WRITE_FAILED", cause: { code: "ENOENT" } });
    expect(rename).toHaveBeenCalledTimes(1);
    expect(await storage.readJob(job.jobId)).toEqual(job);
  });
});
