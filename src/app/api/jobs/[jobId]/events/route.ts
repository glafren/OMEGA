import { jobStorage } from "@/services/storage/localStorage";
import { eventName, jobEvents } from "@/services/jobs/jobEvents";
import type { JobEvent } from "@/types";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params; const job = await jobStorage.readJob(jobId);
  if (!job) return new Response("İş bulunamadı", { status: 404 });
  const encoder = new TextEncoder(); let heartbeat: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: JobEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      send({ jobId, stage: job.stage, message: job.message, progress: job.progress, timestamp: job.updatedAt });
      if (job.stage === "COMPLETED" || job.stage === "ERROR") { controller.close(); return; }
      const listener = (event: JobEvent) => { try { send(event); if (event.stage === "COMPLETED" || event.stage === "ERROR") { cleanup(); controller.close(); } } catch { cleanup(); } };
      const cleanup = () => { clearInterval(heartbeat); jobEvents.off(eventName(jobId), listener); };
      jobEvents.on(eventName(jobId), listener); heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { cleanup(); } }, 15_000);
      request.signal.addEventListener("abort", cleanup, { once: true });
    }, cancel() { clearInterval(heartbeat); }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
