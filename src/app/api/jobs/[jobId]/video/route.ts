import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jobStorage } from "@/services/storage/localStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await jobStorage.readJob(jobId);
  if (!job?.video) return NextResponse.json({ error: "Video bulunamadı." }, { status: 404 });
  const buffer = await readFile(path.join(jobStorage.paths(jobId).output, job.video.filename));
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${buffer.length}` } });
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1;
    if (start > end || start >= buffer.length) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${buffer.length}` } });
    const chunk = buffer.subarray(start, end + 1);
    return new Response(new Uint8Array(chunk), { status: 206, headers: { "Content-Type": "video/mp4", "Content-Length": String(chunk.length), "Content-Range": `bytes ${start}-${end}/${buffer.length}`, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" } });
  }
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename="${job.video.filename}"`,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    },
  });
}
