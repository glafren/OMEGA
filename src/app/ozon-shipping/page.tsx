"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, FileSpreadsheet, LoaderCircle, PackageCheck, ReceiptText } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { OzonStore } from "@/services/ozon/shippingFees";

const stores: Array<{ id: OzonStore; name: string; description: string; logo: string }> = [
  { id: "omega", name: "OMEGA", description: "OMEGA Ozon Seller hesabı", logo: "/branding/store-logo.png" },
  { id: "nozzle", name: "NOZZLE", description: "NOZZLE Ozon Seller hesabı", logo: "/branding/nozzle logo.png" },
];

export default function OzonShippingPage() {
  const [store, setStore] = useState<OzonStore>("omega");
  const [postingNumbers, setPostingNumbers] = useState("");
  const [usdRate, setUsdRate] = useState("");
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonFile, setComparisonFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    setMessage("");
    if (!postingNumbers.trim() || !Number(usdRate)) return setMessage("Sipariş numaralarını ve geçerli dolar kurunu girin.");
    if (comparisonEnabled && !comparisonFile) return setMessage("Kargo ücreti kıyaslaması için bir .xlsx dosyası yükleyin.");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("store", store);
      form.set("postingNumbers", postingNumbers);
      form.set("usdRate", usdRate);
      form.set("comparisonEnabled", String(comparisonEnabled));
      if (comparisonEnabled && comparisonFile) form.set("comparisonFile", comparisonFile);
      const response = await fetch("/api/ozon/shipping-fees", { method: "POST", body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Rapor oluşturulamadı.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `ozon-kargo-kesintileri-${store}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = filename; link.click();
      URL.revokeObjectURL(url);
      setMessage(`${response.headers.get("x-ozon-row-count") || ""} satırlık Excel raporu indirildi.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rapor oluşturulamadı.");
    } finally { setBusy(false); }
  };

  return <main className="page-enter mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-10">
    <PageHeading eyebrow="Ozon Seller" title="Kargo Ücreti ve Teslim Tarihi" description="Teslim edilen siparişlerdeki Uluslararası teslimat hizmeti kesintisini bulun, kullanıcı kuruyla dolara çevirin ve Excel olarak indirin." />
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="border-0 p-6 shadow-[0_12px_35px_rgba(15,23,42,.07)] lg:p-8">
        <div><p className="text-sm font-black text-slate-900">1. Mağazayı seçin</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{stores.map((item) => <button key={item.id} type="button" onClick={() => setStore(item.id)} disabled={busy} className={cn("flex items-center gap-3 rounded-2xl border p-4 text-left transition", store === item.id ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-slate-50 hover:bg-white")}><span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-sm"><Image src={item.logo} alt={`${item.name} logosu`} width={42} height={42} className="max-h-full w-auto object-contain" /></span><span><span className="block font-black">{item.name}</span><span className="text-xs text-slate-500">{item.description}</span></span></button>)}</div></div>
        <label className="mt-6 block"><span className="text-sm font-black text-slate-900">2. Sipariş / gönderi numaraları</span><span className="mt-1 block text-xs text-slate-500">Her satıra bir numara yazın. Virgül veya boşlukla da ayırabilirsiniz.</span><textarea value={postingNumbers} onChange={(event) => setPostingNumbers(event.target.value)} disabled={busy} placeholder={"12345678-0001-1\n12345678-0002-1"} className="mt-3 min-h-56 w-full resize-y rounded-2xl border border-slate-300 bg-white p-4 font-mono text-sm leading-6 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /></label>
        <label className="mt-6 block max-w-sm"><span className="text-sm font-black text-slate-900">3. Dolar kuru</span><span className="mt-1 block text-xs text-slate-500">1 USD kaç RUB? Örnek: 96,50</span><Input className="mt-3" type="number" min="0.0001" step="0.0001" value={usdRate} onChange={(event) => setUsdRate(event.target.value)} disabled={busy} placeholder="96.50" /></label>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={comparisonEnabled} onChange={(event) => { setComparisonEnabled(event.target.checked); if (!event.target.checked) setComparisonFile(null); }} disabled={busy} className="size-5 rounded border-slate-300 accent-blue-700" /><span><span className="block text-sm font-black text-slate-900">Kargo ücret kıyaslaması yap</span><span className="mt-0.5 block text-xs text-slate-500">Birim ücret × adet eksi Ozon kesintisi rapora işaretli fark olarak eklenir.</span></span></label>
          {comparisonEnabled && <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-blue-300 bg-white p-4 transition hover:border-blue-500"><FileSpreadsheet className="size-6 shrink-0 text-blue-700" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{comparisonFile?.name || "Kıyaslama Excel dosyasını seçin"}</span><span className="mt-0.5 block text-xs text-slate-500">İlk satır: Ürün Kodu ve Kargo Ücreti (USD). Ücret tek adet içindir.</span></span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} className="sr-only" onChange={(event) => { setComparisonFile(event.target.files?.[0] || null); setMessage(""); }} /></label>}
        </div>
        {message && <p className={cn("mt-5 rounded-xl px-4 py-3 text-sm font-semibold", message.includes("indirildi") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{message}</p>}
        <div className="mt-6 flex justify-end"><Button onClick={() => void submit()} disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{busy ? "Ozon sorgulanıyor" : "Excel Raporunu Oluştur"}</Button></div>
      </Card>
      <div className="space-y-4">
        <Card className="border-0 bg-[#101c33] p-6 text-white shadow-[0_12px_35px_rgba(15,23,42,.12)]"><ReceiptText className="size-8 text-[#fefeeb]" /><h2 className="mt-5 text-lg font-black">Rapor içeriği</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300"><li>• Mağaza ve sipariş numarası</li><li>• Tahakkuk tarihi ve ürün kodu</li><li>• RUB kesintisi ve USD karşılığı</li><li>• Bulunamayan kayıt açıklaması</li></ul></Card>
        <Card className="border-0 p-6 shadow-[0_12px_35px_rgba(15,23,42,.07)]"><PackageCheck className="size-7 text-emerald-600" /><p className="mt-4 font-black text-slate-900">Güvenli bağlantı</p><p className="mt-2 text-sm leading-6 text-slate-500">API anahtarları tarayıcıya gönderilmez; yalnızca yerel sunucudan Ozon’a iletilir.</p></Card>
      </div>
    </div>
  </main>;
}
