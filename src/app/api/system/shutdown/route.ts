const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const isLocalRequest = LOCAL_HOSTNAMES.has(requestUrl.hostname) && (!origin || origin === requestUrl.origin);
  const isAppRequest = request.headers.get("x-omega-shutdown") === "1";
  if (!isLocalRequest || !isAppRequest) return Response.json({ error: "Yetkisiz kapatma isteği." }, { status: 403 });

  const port = process.env.OMEGA_CONTROL_PORT;
  const token = process.env.OMEGA_CONTROL_TOKEN;
  if (!port || !token) {
    setTimeout(() => process.exit(0), 750);
    return Response.json({ shuttingDown: true }, { status: 202 });
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port}/shutdown`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Kapatma servisi ${response.status} döndürdü.`);
    return Response.json({ shuttingDown: true }, { status: 202 });
  } catch {
    return Response.json({ error: "Uygulama kapatılamadı." }, { status: 503 });
  }
}
