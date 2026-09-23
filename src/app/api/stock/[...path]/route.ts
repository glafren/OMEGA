import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = `http://127.0.0.1:8010/api/${path.map(encodeURIComponent).join("/")}`;
  try {
    const body = request.method === "GET" ? undefined : await request.arrayBuffer();
    const response = await fetch(target, {
      method: request.method,
      body,
      headers: request.headers.get("content-type") ? { "content-type": request.headers.get("content-type")! } : undefined,
      cache: "no-store",
    });
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
