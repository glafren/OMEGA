import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { AppError, friendlyError } from "@/lib/errors";
import { googleDepotSheetUrl, installDepotWorkbook, installedDepotWorkbookPath, syncGoogleDepotSheet } from "@/services/stock/googleDepotSheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 10 * 1024 * 1024;

export async function GET() {
  try {
    const depotPath = await installedDepotWorkbookPath();
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
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const validation = await syncGoogleDepotSheet(request.signal);
      return NextResponse.json({ message: "Google Depo Tipi tablosu güncellendi.", validation, sheetUrl: googleDepotSheetUrl() });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Excel dosyası seçilmedi." }, { status: 400 });
    if (path.extname(file.name).toLowerCase() !== ".xlsx") return NextResponse.json({ error: "Yalnızca XLSX dosyası yüklenebilir." }, { status: 400 });
    if (file.size < 4 || file.size > MAX_SIZE) return NextResponse.json({ error: "Dosya boş veya 10 MB sınırını aşıyor." }, { status: 413 });
    const data = Buffer.from(await file.arrayBuffer());
    if (!data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return NextResponse.json({ error: "Dosya geçerli bir XLSX değil." }, { status: 400 });

    const validation = await installDepotWorkbook(data);
    return NextResponse.json({ message: "Depo tipi dosyası güncellendi.", validation });
  } catch (error) {
    const status = error instanceof AppError && error.code === "INVALID_DEPOT_WORKBOOK" ? 422 : 500;
    return NextResponse.json({ error: friendlyError(error) }, { status });
  }
}
