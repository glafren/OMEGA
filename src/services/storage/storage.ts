import type { JobRecord } from "@/types";

export interface JobPaths { root: string; source: string; output: string; metadata: string; zip: string }
export interface StorageAdapter {
  createJob(job: JobRecord): Promise<JobPaths>;
  readJob(jobId: string): Promise<JobRecord | null>;
  writeJob(job: JobRecord): Promise<void>;
  paths(jobId: string): JobPaths;
  cleanup(): Promise<void>;
}
