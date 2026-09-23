import { workQueue } from "@/services/queue/workQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(workQueue.snapshot(), { headers: { "cache-control": "no-store" } });
}
