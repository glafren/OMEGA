"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BadgeDollarSign, ChevronLeft, ChevronRight, FileSpreadsheet, ImageIcon, Menu, PackageSearch, Settings, Tags, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { QueueIndicator } from "@/components/queue-indicator";

const navigation = [
  { href: "/media", label: "Medya Oluştur", description: "Görsel ve video", icon: ImageIcon },
  { href: "/stock", label: "Stok Kontrol", description: "Sipariş analizi", icon: PackageSearch },
  { href: "/prices", label: "Fiyat Sorgu", description: "Ürün kodu fiyatı", icon: BadgeDollarSign },
  { href: "/stock-template", label: "Stok Şablonu", description: "Ozon Excel çıktısı", icon: FileSpreadsheet },
  { href: "/labels", label: "Etiket Yazdır", description: "PDF etiket düzenleme", icon: Tags },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return <div className="min-h-screen bg-[#f4f6fa]">
    <aside className={cn("fixed inset-y-0 left-0 z-40 w-72 border-r border-white/10 bg-[#101c33] text-white transition-[width,transform] duration-300 lg:translate-x-0", collapsed ? "lg:w-20" : "lg:w-72", open ? "translate-x-0" : "-translate-x-full")}>
      <button type="button" onClick={() => setCollapsed((value) => !value)} className="absolute -right-3 top-8 z-10 hidden size-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-[#fefeeb] lg:flex" aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"} title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}>{collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}</button>
      <div className={cn("flex h-24 items-center gap-3 border-b border-white/10 px-5 transition-all", collapsed && "lg:justify-center lg:px-2")}>
        <Image src="/branding/store-logo.png" alt="OMEGA" width={62} height={62} priority className={cn("size-[62px] shrink-0 rounded-full object-contain shadow-lg shadow-black/20 transition-all", collapsed && "lg:size-12")} />
        <div className={cn("whitespace-nowrap", collapsed && "lg:hidden")}><div className="text-base font-black tracking-[0.14em]">OMEGA</div><div className="mt-0.5 text-[10px] font-semibold leading-4 tracking-[0.12em] text-slate-400">OPERASYON<br />MERKEZİ</div></div>
        <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Menüyü kapat"><X /></button>
      </div>
      <div className={cn("px-4 py-6 transition-all", collapsed && "lg:px-2")}>
        <p className={cn("px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500", collapsed && "lg:hidden")}>Araçlar</p>
        <nav className="mt-3 space-y-1.5">{navigation.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} title={collapsed ? item.label : undefined} className={cn("group flex items-center gap-3 rounded-xl px-3 py-3 transition", collapsed && "lg:justify-center lg:px-2", active ? "bg-[#fefeeb] text-[#101c33] shadow-lg" : "text-slate-300 hover:bg-white/8 hover:text-white")}>
            <span className={cn("grid size-10 place-items-center rounded-xl", active ? "bg-[#101c33] text-[#fefeeb]" : "bg-white/8 group-hover:bg-white/12")}><Icon className="size-5" /></span>
            <span className={cn("whitespace-nowrap", collapsed && "lg:hidden")}><span className="block text-sm font-bold">{item.label}</span><span className={cn("block text-xs", active ? "text-slate-500" : "text-slate-500")}>{item.description}</span></span>
          </Link>;
        })}</nav>
      </div>
      <div className={cn("absolute inset-x-4 bottom-5", collapsed && "lg:inset-x-2")}><Link href="/settings" onClick={() => setOpen(false)} title={collapsed ? "Medya Ayarları" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition", collapsed && "lg:justify-center lg:px-2", pathname === "/settings" ? "bg-[#fefeeb] text-[#101c33]" : "text-slate-300 hover:bg-white/8 hover:text-white")}><Settings className="size-5 shrink-0" /><span className={cn("whitespace-nowrap", collapsed && "lg:hidden")}>Medya Ayarları</span></Link></div>
    </aside>
    {open && <button className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-label="Menüyü kapat" />}
    <div className={cn("transition-[padding] duration-300", collapsed ? "lg:pl-20" : "lg:pl-72")}>
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur-xl lg:px-8">
        <button className="mr-3 grid size-10 place-items-center rounded-xl border border-slate-200 lg:hidden" onClick={() => setOpen(true)} aria-label="Menüyü aç"><Menu className="size-5" /></button>
        <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-700">OMEGA</p><p className="text-sm font-bold text-slate-800">E-ticaret operasyonlarını tek yerden yönetin</p></div>
        <div className="ml-auto flex items-center gap-2"><QueueIndicator /><span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 sm:flex"><span className="size-2 rounded-full bg-emerald-500" />Yerel sistem</span></div>
      </header>
      {children}
    </div>
  </div>;
}
