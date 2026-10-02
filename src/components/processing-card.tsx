import { AlertCircle, Check, Circle, LoaderCircle, Square } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import type { JobEvent, JobStage, ProductBrand } from "@/types";

const allStages: Array<{ key: JobStage; label: string }> = [
  { key: "VALIDATING_INPUT", label: "Girdi doğrulanıyor" }, { key: "RESOLVING_PRODUCT", label: "Ürün adresi çözümleniyor" }, { key: "OPENING_IKEA_PAGE", label: "Ürün sayfası açılıyor" },
  { key: "EXTRACTING_PRODUCT_DATA", label: "Ürün bilgileri alınıyor" }, { key: "EXTRACTING_IMAGES", label: "Ürün görselleri bulunuyor" },
  { key: "DOWNLOADING_IMAGES", label: "Görseller indiriliyor" }, { key: "PROCESSING_COVER", label: "Kapak görseli hazırlanıyor" },
  { key: "PROCESSING_GALLERY", label: "Galeri görselleri işleniyor" }, { key: "CREATING_VIDEO", label: "Video oluşturuluyor" },
  { key: "CREATING_RICH_CONTENT", label: "Rusça Rich Content hazırlanıyor" }, { key: "CREATING_ZIP", label: "ZIP oluşturuluyor" },
];

export function ProcessingCard({ event, onCancel, canceling }: { event: JobEvent; brand?: ProductBrand; onCancel?: () => void; canceling?: boolean }) {
  const stages = allStages;
  const order = stages.map((item) => item.key);
  const failed = event.stage === "ERROR"; const current = order.indexOf(event.stage);
  return <Card className="overflow-hidden" aria-live="polite"><div className="border-b border-slate-100 p-6 sm:p-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-slate-950">{failed ? "İşlem tamamlanamadı" : "Ürün hazırlanıyor"}</h2><p className={failed ? "mt-1 text-sm text-red-600" : "mt-1 text-sm text-slate-500"}>{event.message}</p></div><div className="flex items-center gap-3">{onCancel && !failed ? <Button variant="secondary" onClick={onCancel} disabled={canceling}><Square className="size-4" />{canceling ? "Durduruluyor" : "Durdur"}</Button> : null}{failed ? <AlertCircle className="size-8 text-red-500" /> : <LoaderCircle className="size-7 animate-spin text-blue-700" />}</div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className={failed ? "h-full rounded-full bg-red-500 transition-all" : "h-full rounded-full bg-blue-700 transition-all"} style={{ width: `${event.progress}%` }} /></div><p className="mt-2 text-right text-sm font-semibold text-slate-700">%{event.progress}</p></div><ol className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8">{stages.map((stage, index) => { const done = !failed && (current > index || event.stage === "COMPLETED"); const active = current === index && !failed; return <li key={stage.key} className="flex items-center gap-3 text-sm">{done ? <span className="grid size-6 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-4" /></span> : active ? <LoaderCircle className="size-6 animate-spin text-blue-700" /> : <Circle className="size-6 text-slate-300" />}<span className={done || active ? "font-medium text-slate-800" : "text-slate-400"}>{stage.label}</span></li>; })}</ol></Card>;
}
