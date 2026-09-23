import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { jobStorage } from "@/services/storage/localStorage";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params; const job = await jobStorage.readJob(jobId);
  if (!job || job.status !== "completed") return NextResponse.json({ error: "ZIP henüz hazır değil." }, { status: 404 });
  const buffer = await readFile(jobStorage.paths(jobId).zip); const code = job.product?.productCode.replace(/\D/g, "") || "product";
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${code}_images.zip"` } });
}
