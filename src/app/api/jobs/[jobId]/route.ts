import { NextResponse } from "next/server";
import { jobStorage } from "@/services/storage/localStorage";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params; const job = await jobStorage.readJob(jobId);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "İş bulunamadı." }, { status: 404 });
}
