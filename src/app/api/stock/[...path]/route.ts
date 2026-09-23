import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { workQueue } from "@/services/queue/workQueue";
import { getQueuedStockTemplate, getStockTemplateBackendId, startQueuedStockTemplate } from "@/services/queue/stockTemplateQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  try {
    if (request.method === "POST" && path[0] === "start-stock-template") {
      return NextResponse.json(startQueuedStockTemplate(), { status: 202 });
    }
    if (request.method === "GET" && path[0] === "stock-template-status" && path[1]) {
      const job = getQueuedStockTemplate(path[1]);
      return job ? NextResponse.json(job) : NextResponse.json({ error: "İş bulunamadı" }, { status: 404 });
    }
    let backendPath = path;
    if (request.method === "GET" && path[0] === "stock-template-download" && path[1]) {
      const backendId = getStockTemplateBackendId(path[1]);
      if (!backendId) return NextResponse.json({ error: "Dosya henüz hazır değil" }, { status: 409 });
      backendPath = [path[0], backendId];
    }
    const target = `http://127.0.0.1:8010/api/${backendPath.map(encodeURIComponent).join("/")}`;
    const body = request.method === "GET" ? undefined : await request.arrayBuffer();
    const execute = () => fetch(target, { method: request.method, body, headers: request.headers.get("content-type") ? { "content-type": request.headers.get("content-type")! } : undefined, cache: "no-store" });
    const response = request.method === "POST" && path[0] === "check-order"
      ? await workQueue.enqueue({ id: randomUUID(), type: "stock-check", label: "Sipariş stok kontrolü" }, execute)
      : await execute();
    const headers = new Headers();
    for (const key of ["content-type", "content-disposition", "x-generated-rows", "x-skipped-count", "x-stock-error-count"]) {
      const value = response.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new NextResponse(response.body, { status: response.status, headers });
  } catch {
    return NextResponse.json({ error: "Stok servisine ulaşılamadı. Uygulamayı baslat.bat ile açın." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
