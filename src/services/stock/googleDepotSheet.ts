import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { AppError } from "@/lib/errors";

const execFileAsync = promisify(execFile);
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1O35TZHaMCZ_vPdAu6BVLzk4kqJYee-j6u1gzijRsE10/edit?usp=sharing";
const MAX_SIZE = 10 * 1024 * 1024;

export type DepotValidation = {
  row_count?: number;
  unique_products?: number;
  unique_codes?: number;
  issue_count?: number;
  error_count?: number;
  warning_count?: number;
  issues?: Array<Record<string, unknown>>;
};

const bundledDepotPath = path.join(process.cwd(), "backend", "stock", "templates", "Depo Tipi.xlsx");
const runtimeDepotPath = path.join(process.cwd(), "backend", "stock", "runtime", "Depo Tipi.xlsx");
const backupPath = path.join(process.cwd(), "backend", "stock", "runtime", "Depo Tipi.backup.xlsx");

export async function installedDepotWorkbookPath() {
  try { await stat(runtimeDepotPath); return runtimeDepotPath; } catch { return bundledDepotPath; }
}

export function googleDepotSheetUrl() {
  return process.env.GOOGLE_DEPOT_SHEET_URL?.trim() || DEFAULT_SHEET_URL;
}

export function googleSheetExportUrl(sheetUrl = googleDepotSheetUrl()) {
  const url = new URL(sheetUrl);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") throw new AppError("Google Depo Tipi bağlantısı geçersiz.", "INVALID_GOOGLE_SHEET_URL");
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (!match) throw new AppError("Google Depo Tipi bağlantısında tablo kimliği bulunamadı.", "INVALID_GOOGLE_SHEET_URL");
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
}

export async function validateDepotWorkbook(filePath: string): Promise<DepotValidation> {
  const validator = path.join(process.cwd(), "backend", "stock", "validate_depot_file.py");
  try {
    const { stdout } = await execFileAsync(process.env.PYTHON_EXECUTABLE || "python", [validator, filePath], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || "{}") as DepotValidation;
  } catch (error) {
    const stdout = typeof error === "object" && error && "stdout" in error ? String(error.stdout) : "";
    const lastLine = stdout.trim().split(/\r?\n/).at(-1);
    let validation: DepotValidation | undefined;
    try { validation = lastLine ? JSON.parse(lastLine) as DepotValidation : undefined; } catch {}
    const detail = validation?.error_count ? ` ${validation.error_count} hata bulundu.` : "";
    throw new AppError(`Depo tipi listesi doğrulanamadı.${detail}`, "INVALID_DEPOT_WORKBOOK", { cause: error });
  }
}

function verifyXlsx(data: Buffer) {
  if (data.length < 4 || data.length > MAX_SIZE) throw new AppError("Depo tipi dosyası boş veya 10 MB sınırını aşıyor.", "INVALID_DEPOT_WORKBOOK");
  if (!data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new AppError("İndirilen dosya geçerli bir XLSX değil.", "INVALID_DEPOT_WORKBOOK");
}

export async function installDepotWorkbook(data: Buffer) {
  verifyXlsx(data);
  const workDir = await mkdtemp(path.join(tmpdir(), "omega-depot-"));
  try {
    const candidate = path.join(workDir, "Depo Tipi.xlsx");
    await writeFile(candidate, data);
    const validation = await validateDepotWorkbook(candidate);
    await mkdir(path.dirname(runtimeDepotPath), { recursive: true });
    await copyFile(runtimeDepotPath, backupPath).catch(() => undefined);
    await copyFile(candidate, runtimeDepotPath);
    return validation;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function syncGoogleDepotSheet(signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(googleSheetExportUrl(), { cache: "no-store", redirect: "follow", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new AppError("Google Depo Tipi tablosuna ulaşılamadı.", "GOOGLE_SHEET_UNAVAILABLE", { cause: error });
  }
  if (!response.ok) throw new AppError(`Google Depo Tipi tablosu indirilemedi (${response.status}). Paylaşım iznini kontrol edin.`, "GOOGLE_SHEET_UNAVAILABLE");
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_SIZE) throw new AppError("Google Depo Tipi tablosu 10 MB sınırını aşıyor.", "INVALID_DEPOT_WORKBOOK");
  return installDepotWorkbook(Buffer.from(await response.arrayBuffer()));
}

export async function readInstalledDepotWorkbook() {
  return readFile(await installedDepotWorkbookPath());
}
