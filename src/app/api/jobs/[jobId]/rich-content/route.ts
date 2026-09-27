import { readFile } from "node:fs/promises";
import path from "node:path";
import { jobStorage } from "@/services/storage/localStorage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/jobs/[jobId]/rich-content">) {
  const { jobId } = await context.params;
  const job = await jobStorage.readJob(jobId);
  if (!job?.richContent) return Response.json({ error: "Rich Content bulunamadı." }, { status: 404 });
  try {
    const file = await readFile(path.join(jobStorage.paths(jobId).output, job.richContent.filename));
    return new Response(file, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "Rich Content dosyası okunamadı." }, { status: 404 });
  }
}
