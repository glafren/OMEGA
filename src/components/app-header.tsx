import Link from "next/link";
import { Settings, Sparkles } from "lucide-react";
import { Button } from "./ui/button";

export function AppHeader() {
  return <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8"><Link href="/" className="flex items-center gap-3 font-bold tracking-tight text-slate-950"><span className="grid size-10 place-items-center rounded-xl bg-blue-700 text-white"><Sparkles className="size-5" /></span><span><span className="block text-base">IKEA Ozon Studio</span><span className="block text-xs font-medium text-slate-500">Marketplace görsel hazırlayıcı</span></span></Link><Link href="/settings"><Button variant="secondary" size="sm" aria-label="Ayarları aç"><Settings className="size-4" />Ayarlar</Button></Link></div></header>;
}
