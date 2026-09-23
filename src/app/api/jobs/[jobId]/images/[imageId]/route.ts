import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jobStorage } from "@/services/storage/localStorage";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ jobId: string; imageId: string }> }) {
  const { jobId, imageId } = await context.params; const job = await jobStorage.readJob(jobId); const output = job?.outputs.find((item) => item.id === imageId);
  if (!output) return NextResponse.json({ error: "Görsel bulunamadı." }, { status: 404 });
  const buffer = await readFile(path.join(jobStorage.paths(jobId).output, output.filename));
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}
