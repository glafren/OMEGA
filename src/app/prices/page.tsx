/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import { Download, FileDown, LoaderCircle, Search, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeading } from "@/components/page-heading";

type PriceItem = {
  stock_code: string;
  query_code: string;
  product_name: string;
  unit_price: number | null;
  image_url?: string | null;
  status: "ok" | "price_missing" | "error";
  error?: string;
};
type Result = { items: PriceItem[]; skipped_lines: { line: number; text: string; reason: string }[] };

const sample = "801.521.55\n305.229.22\n104.611.90";

function money(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PricesPage() {
  const [text, setText] = useState(sample);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"excel" | "pdf" | "">("");

  const total = useMemo(() => (result?.items || []).reduce((sum, item) => sum + (item.unit_price || 0), 0), [result]);
  const pricedCount = useMemo(() => (result?.items || []).filter((item) => item.unit_price != null).length, [result]);

  const check = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stock/check-prices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Fiyatlar alınamadı.");
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fiyatlar alınamadı.");
    } finally {
      setBusy(false);
    }
  };

  const exportFile = async (type: "excel" | "pdf") => {
    if (!result?.items.length) return;
    setExporting(type);
    setError("");
    try {
      const response = await fetch(type === "excel" ? "/api/stock/export-prices-excel" : "/api/stock/export-prices-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: result.items }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Dosya hazırlanamadı.");
      }
      downloadBlob(await response.blob(), type === "excel" ? "ikea-fiyat-listesi.xlsx" : "ikea-fiyat-listesi.pdf");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dosya hazırlanamadı.");
    } finally {
      setExporting("");
    }
  };

  return <main className="page-enter mx-auto max-w-[1400px] px-5 py-8 lg:px-8 lg:py-10">
    <PageHeading eyebrow="IKEA Fiyat Operasyonu" title="Ürün Kodu ile Fiyat Sorgu" description="IKEA ürün kodlarını girin; ürün adı ve güncel fiyatları listeleyip Excel veya PDF olarak indirin." />
    <Card className="overflow-hidden border-0 shadow-[0_12px_35px_rgba(15,23,42,.07)]">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="p-6 lg:p-8">
          <label className="text-sm font-bold text-slate-800">Ürün kodları</label>
          <p className="mt-1 text-xs text-slate-500">Kodları satır satır yazabilirsiniz; aynı kodlar tekilleştirilir.</p>
          <textarea value={text} onChange={(event) => setText(event.target.value)} className="mt-4 min-h-44 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-7 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
          {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void check()} disabled={busy || !text.trim()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}{busy ? "Sorgulanıyor" : "Fiyatları Çek"}</Button>
            <Button variant="secondary" onClick={() => void exportFile("excel")} disabled={!result?.items.length || !!exporting}>{exporting === "excel" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}Excel İndir</Button>
            <Button variant="secondary" onClick={() => void exportFile("pdf")} disabled={!result?.items.length || !!exporting}>{exporting === "pdf" ? <LoaderCircle className="size-4 animate-spin" /> : <FileDown className="size-4" />}PDF İndir</Button>
          </div>
        </div>
        <div className="bg-[#101c33] p-6 text-white lg:p-8">
          <Tags className="size-8 text-[#fefeeb]" />
          <p className="mt-5 text-xs font-bold uppercase tracking-widest text-slate-400">Fiyat özeti</p>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div><p className="text-3xl font-black">{result?.items.length || 0}</p><p className="text-xs text-slate-400">ürün kodu</p></div>
            <div><p className="text-3xl font-black">{pricedCount}</p><p className="text-xs text-slate-400">fiyat bulunan</p></div>
            <div className="col-span-2 lg:col-span-1"><p className="text-2xl font-black">{money(total)}</p><p className="text-xs text-slate-400">birim fiyat toplamı</p></div>
          </div>
        </div>
      </div>
    </Card>
    {result && <section className="mt-7">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead><tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="p-4">Ürün</th><th className="p-4">Kod</th><th className="p-4">Fiyat</th><th className="p-4">Durum</th></tr></thead>
          <tbody>{result.items.map((item) => <tr key={item.query_code} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
            <td className="p-4"><div className="flex items-center gap-3">{item.image_url ? <img src={item.image_url} alt="" className="size-12 rounded-xl border object-contain" /> : <span className="size-12 rounded-xl bg-slate-100" />}<p className="max-w-xl font-bold text-slate-900">{item.product_name}</p></div></td>
            <td className="p-4 font-mono text-xs font-bold text-slate-600">{item.stock_code}</td>
            <td className="p-4 text-base font-black text-slate-900">{money(item.unit_price)}</td>
            <td className="p-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${item.unit_price != null ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{item.unit_price != null ? "Fiyat bulundu" : "Fiyat alınamadı"}</span></td>
          </tr>)}</tbody>
        </table>
        {result.items.length === 0 && <p className="p-10 text-center text-sm text-slate-500">Sorgulanacak ürün kodu bulunamadı.</p>}
      </Card>
      {result.skipped_lines.length > 0 && <p className="mt-3 text-xs text-amber-700">{result.skipped_lines.length} satır ürün kodu bulunamadığı için atlandı.</p>}
    </section>}
  </main>;
}
