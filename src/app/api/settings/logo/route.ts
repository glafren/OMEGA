import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";

const logoPath = path.join(process.cwd(), "public", "branding", "store-logo.png");
const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { const buffer = await readFile(logoPath); return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
  const form = await request.formData(); const file = form.get("logo");
  if (!(file instanceof File) || !allowed.has(file.type) || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "PNG, JPG veya WEBP; en fazla 5 MB dosya yükleyin." }, { status: 400 });
  try { const output = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000 }).rotate().resize({ width: 800, height: 400, fit: "inside", withoutEnlargement: true }).png().toBuffer(); await writeFile(logoPath, output); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Logo dosyası işlenemedi." }, { status: 400 }); }
}
