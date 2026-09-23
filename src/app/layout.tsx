import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: "OMEGA Operasyon Merkezi", description: "Medya, stok ve etiket operasyonları tek uygulamada." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="tr"><body><AppShell>{children}</AppShell></body></html>; }
