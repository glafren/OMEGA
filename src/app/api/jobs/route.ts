import { NextResponse } from "next/server";
import { createJobSchema } from "@/lib/validation";
import { createJob, runJob } from "@/services/jobs/jobManager";
import { workQueue } from "@/services/queue/workQueue";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const parsed = createJobSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Geçersiz istek." }, { status: 400 });
  const job = await createJob(parsed.data.input);
  void workQueue.enqueue({ id: job.jobId, type: "media", label: parsed.data.input }, () => runJob(job.jobId));
  return NextResponse.json({ jobId: job.jobId }, { status: 202 });
}
