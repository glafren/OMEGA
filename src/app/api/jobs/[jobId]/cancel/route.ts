import { NextResponse } from "next/server";
import { cancelJob } from "@/services/jobs/jobManager";
import { workQueue } from "@/services/queue/workQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  workQueue.cancel(jobId);
  const job = await cancelJob(jobId);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "İş bulunamadı." }, { status: 404 });
}
