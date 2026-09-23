import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/services/settings/settingsService";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await readSettings()); }
export async function PUT(request: Request) { try { return NextResponse.json(await writeSettings(await request.json())); } catch { return NextResponse.json({ error: "Ayarlar doğrulanamadı." }, { status: 400 }); } }
