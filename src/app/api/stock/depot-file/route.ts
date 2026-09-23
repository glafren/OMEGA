import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const depotPath = path.join(process.cwd(), "backend", "stock", "templates", "Depo Tipi.xlsx");
const backupPath = path.join(process.cwd(), "backend", "stock", "templates", "Depo Tipi.backup.xlsx");
const MAX_SIZE = 10 * 1024 * 1024;

export async function GET() {
  try {
    const [data, details] = await Promise.all([readFile(depotPath), stat(depotPath)]);
    return new NextResponse(data, { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": "attachment; filename=depo-tipi.xlsx; filename*=UTF-8''Depo%20Tipi.xlsx",
      "content-length": String(data.length),
      "last-modified": details.mtime.toUTCString(),
      "cache-control": "no-store",
    } });
  } catch {
    return NextResponse.json({ error: "Depo Tipi.xlsx bulunamadı." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  let workDir = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Excel dosyası seçilmedi." }, { status: 400 });
    if (path.extname(file.name).toLowerCase() !== ".xlsx") return NextResponse.json({ error: "Yalnızca XLSX dosyası yüklenebilir." }, { status: 400 });
    if (file.size < 4 || file.size > MAX_SIZE) return NextResponse.json({ error: "Dosya boş veya 10 MB sınırını aşıyor." }, { status: 413 });
    const data = Buffer.from(await file.arrayBuffer());
    if (!data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return NextResponse.json({ error: "Dosya geçerli bir XLSX değil." }, { status: 400 });

    workDir = await mkdtemp(path.join(tmpdir(), "omega-depot-"));
    const candidate = path.join(workDir, "Depo Tipi.xlsx");
    await writeFile(candidate, data);
    const validator = path.join(process.cwd(), "backend", "stock", "validate_depot_file.py");
    let validation: Record<string, unknown>;
    try {
      const { stdout } = await execFileAsync(process.env.PYTHON_EXECUTABLE || "python", [validator, candidate], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
      validation = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || "{}");
    } catch (error) {
      const stdout = typeof error === "object" && error && "stdout" in error ? String(error.stdout) : "";
      const lastLine = stdout.trim().split(/\r?\n/).at(-1);
      const parsed = lastLine ? JSON.parse(lastLine) : null;
      return NextResponse.json({ error: "Dosya doğrulanamadı. Hatalı ürün kodlarını veya depo tiplerini düzeltin.", validation: parsed }, { status: 422 });
    }
    await copyFile(depotPath, backupPath).catch(() => undefined);
    await copyFile(candidate, depotPath);
    return NextResponse.json({ message: "Depo tipi dosyası güncellendi.", validation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dosya yüklenemedi." }, { status: 500 });
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
