import path from "node:path";

const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const appConfig = {
  jobStoragePath: path.resolve(/* turbopackIgnore: true */ process.env.JOB_STORAGE_PATH || "./tmp/jobs"),
  retentionHours: numberFromEnv("JOB_RETENTION_HOURS", 24),
  maxImageBytes: numberFromEnv("MAX_IMAGE_DOWNLOAD_MB", 25) * 1024 * 1024,
  jpegQuality: Math.min(100, numberFromEnv("IMAGE_OUTPUT_QUALITY", 92)),
  maxConcurrentDownloads: Math.min(6, numberFromEnv("MAX_CONCURRENT_DOWNLOADS", 3)),
  playwrightTimeout: numberFromEnv("PLAYWRIGHT_TIMEOUT_MS", 45_000),
};
