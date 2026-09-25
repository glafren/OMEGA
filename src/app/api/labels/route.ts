import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { workQueue } from "@/services/queue/workQueue";

export const runtime = "nodejs";
const execFileAsync = promisify(execFile);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function countPdfPages(pdf: Buffer) {
  const text = pdf.toString("latin1");
  return (text.match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
}

export async function POST(request: Request) {
  let workDir = "";
  try {
    const form = await request.formData();
    const order = form.get("order");
    const labels = form.get("labels");
    if (!(order instanceof File) || !(labels instanceof File)) {
      return NextResponse.json({ error: "Sipariş Excel/CSV dosyası ve etiket PDF dosyası zorunludur." }, { status: 400 });
    }
    if (order.size > MAX_FILE_SIZE || labels.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Dosya boyutu 50 MB sınırını aşıyor." }, { status: 413 });
    }
    const orderExt = path.extname(order.name).toLowerCase();
    if (![".xlsx", ".csv"].includes(orderExt) || path.extname(labels.name).toLowerCase() !== ".pdf") {
      return NextResponse.json({ error: "Sipariş dosyası XLSX/CSV, etiket dosyası PDF olmalıdır." }, { status: 400 });
    }

    workDir = await mkdtemp(path.join(tmpdir(), "omega-label-"));
    const orderPath = path.join(workDir, `order${orderExt}`);
    const labelsPath = path.join(workDir, "labels.pdf");
    const outputPath = path.join(workDir, "yazili-etiketler.pdf");
    await Promise.all([
      writeFile(orderPath, Buffer.from(await order.arrayBuffer())),
      writeFile(labelsPath, Buffer.from(await labels.arrayBuffer())),
    ]);
    const script = path.join(process.cwd(), "backend", "label", "label_cli.py");
    const pdf = await workQueue.enqueue({ id: randomUUID(), type: "label", label: order.name }, async () => {
      await execFileAsync(process.env.PYTHON_EXECUTABLE || "python", [script, orderPath, labelsPath, outputPath], {
        windowsHide: true,
        timeout: 5 * 60 * 1000,
        maxBuffer: 1024 * 1024,
      });
      return readFile(outputPath);
    });
    const filename = `${new Date().toISOString().slice(0, 10)}-yazili-etiketler.pdf`;
    const pageCount = countPdfPages(pdf);
    return new NextResponse(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-label-page-count": String(pageCount),
        "x-label-file-name": filename,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Etiketler hazırlanamadı.";
    return NextResponse.json({ error: message.includes("ENOENT") ? "Python bulunamadı. Kurulumu npm run setup ile tamamlayın." : message }, { status: 500 });
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
