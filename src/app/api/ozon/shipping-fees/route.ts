import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, friendlyError } from "@/lib/errors";
import { fetchShippingComparisonFees } from "@/services/ozon/comparisonWorkbook";
import { createShippingFeeReport, ozonStoreLabel, parsePostingNumbers } from "@/services/ozon/shippingFees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  store: z.enum(["omega", "nozzle"]),
  postingNumbers: z.string().trim().min(1).max(30_000),
});

async function readInput(request: Request, signal?: AbortSignal, onProgress?: Parameters<typeof createShippingFeeReport>[4]) {
  const contentType = request.headers.get("content-type") || "";
  const form = contentType.includes("multipart/form-data") ? await request.formData() : undefined;
  const input = requestSchema.parse(form
    ? { store: form.get("store"), postingNumbers: form.get("postingNumbers") }
    : await request.json());
  const comparisonEnabled = form?.get("comparisonEnabled") === "true";
  onProgress?.({ value: 3, stage: `${ozonStoreLabel(input.store)} kargo ücreti tablosu alınıyor` });
  return { input, comparisonEnabled, comparisonFees: await fetchShippingComparisonFees(input.store, signal) };
}

async function buildWorkbook(input: z.infer<typeof requestSchema>, comparisonEnabled: boolean, rows: Awaited<ReturnType<typeof createShippingFeeReport>>) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OMEGA Operasyon Merkezi";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Kargo Kesintileri", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Mağaza", key: "store", width: 14 },
      { header: "Sipariş / Gönderi No", key: "postingNumber", width: 28 },
      { header: "Tahakkuk Tarihi", key: "accrualDate", width: 22 },
      { header: "Ürün Kodu", key: "productCode", width: 28 },
      { header: "Adet", key: "quantity", width: 10 },
      { header: "Kesinti (RUB)", key: "feeAmount", width: 18 },
      { header: "CBR USD Kuru (RUB)", key: "usdRate", width: 21 },
      { header: "Kesinti (USD)", key: "feeUsd", width: 18 },
      ...(comparisonEnabled ? [{ header: "Kullanıcı Kargo Ücreti (USD/Adet)", key: "comparisonFeeUsd", width: 34 }] : []),
      ...(comparisonEnabled ? [{ header: "Fark (Tanımlı Toplam - Kesilen USD)", key: "feeDifferenceUsd", width: 36 }] : []),
      { header: "Açıklama", key: "note", width: 48 },
    ];
    for (const row of rows) sheet.addRow({ ...row, store: ozonStoreLabel(row.store) });
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
      cell.alignment = { vertical: "middle" };
    });
    sheet.getColumn("feeAmount").numFmt = '#,##0.00 "₽"';
    sheet.getColumn("usdRate").numFmt = '#,##0.0000';
    sheet.getColumn("feeUsd").numFmt = '$#,##0.00';
    if (comparisonEnabled) {
      sheet.getColumn("comparisonFeeUsd").numFmt = '$#,##0.00';
      const differenceColumn = sheet.getColumn("feeDifferenceUsd");
      differenceColumn.numFmt = '+$#,##0.00;-$#,##0.00;$0.00';
      differenceColumn.eachCell((cell, rowNumber) => {
        if (rowNumber === 1 || typeof cell.value !== "number") return;
        cell.font = { color: { argb: cell.value >= 0 ? "FF15803D" : "FFDC2626" }, bold: true };
      });
    }
    sheet.autoFilter = { from: "A1", to: `${comparisonEnabled ? "K" : "I"}1` };
    sheet.eachRow((row, index) => { row.height = index === 1 ? 24 : 21; });

    const output = Buffer.from(await workbook.xlsx.writeBuffer());
    const date = new Date().toISOString().slice(0, 10);
    const filename = `ozon-kargo-kesintileri-${input.store}-${date}.xlsx`;
    return { output, filename };
}

async function generateReport(request: Request, signal: AbortSignal, onProgress?: Parameters<typeof createShippingFeeReport>[4]) {
  const { input, comparisonEnabled, comparisonFees } = await readInput(request, signal, onProgress);
  const postingNumbers = parsePostingNumbers(input.postingNumbers);
  if (!postingNumbers.length) throw new AppError("En az bir sipariş numarası girin.", "INVALID_INPUT");
  if (postingNumbers.length > 500) throw new AppError("Tek seferde en fazla 500 sipariş sorgulanabilir.", "TOO_MANY_POSTINGS");
  const rows = await createShippingFeeReport(input.store, postingNumbers, signal, comparisonFees, onProgress);
  onProgress?.({ value: 92, stage: "Excel dosyası oluşturuluyor" });
  const file = await buildWorkbook(input, comparisonEnabled, rows);
  onProgress?.({ value: 98, stage: "Excel dosyası indirilmeye hazırlanıyor" });
  return { ...file, rowCount: rows.length };
}

function errorMessage(error: unknown) {
  return error instanceof z.ZodError ? "Mağaza ve sipariş numaralarını kontrol edin." : friendlyError(error);
}

function errorStatus(error: unknown) {
  return error instanceof z.ZodError ? 400 : error instanceof AppError && error.code === "OZON_CREDENTIALS_MISSING" ? 503 : 500;
}

function streamingResponse(request: Request) {
  const encoder = new TextEncoder();
  const reportAbort = new AbortController();
  const signal = AbortSignal.any([request.signal, reportAbort.signal]);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        if (!cancelled && !signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        send({ type: "progress", value: 1, stage: "Rapor isteği hazırlanıyor" });
        const result = await generateReport(request, signal, (progress) => send({ type: "progress", ...progress }));
        send({ type: "complete", value: 100, stage: "Rapor hazır", filename: result.filename, rowCount: result.rowCount, content: result.output.toString("base64") });
      } catch (error) {
        if (!signal.aborted) send({ type: "error", error: errorMessage(error) });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      reportAbort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  if (request.headers.get("accept")?.includes("application/x-ndjson")) return streamingResponse(request);
  try {
    const result = await generateReport(request, request.signal);
    return new Response(result.output, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "X-Ozon-Row-Count": String(result.rowCount),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: errorStatus(error) });
  }
}
