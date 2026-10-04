import { NextResponse } from "next/server";
import { friendlyError } from "@/lib/errors";
import { retryRichContent } from "@/services/jobs/jobManager";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  try {
    return NextResponse.json(await retryRichContent(jobId));
  } catch (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 409 });
  }
}
