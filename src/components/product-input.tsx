"use client";
import { useState } from "react";
import Image from "next/image";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import type { ProductBrand } from "@/types";

const brands: Array<{ id: ProductBrand; label: string; description: string; logo: string }> = [
  { id: "ikea", label: "IKEA", description: "Link veya ürün kodu", logo: "/branding/ikea-logo.png" },
  { id: "philips", label: "Philips", description: "Philips ürün linki", logo: "/branding/Philipslogo.png" },
  { id: "philips-hue", label: "Philips Hue", description: "Philips Hue ürün linki", logo: "/branding/Philipslogo.png" },
];

export function ProductInput({ busy, onSubmit }: { busy: boolean; onSubmit: (brand: ProductBrand, input: string) => Promise<void> }) {
  const [brand, setBrand] = useState<ProductBrand>("ikea"); const [value, setValue] = useState(""); const [error, setError] = useState("");
  const requiresUrl = brand !== "ikea";
  const inputLabel = brand === "philips-hue" ? "Philips Hue ürün linki" : brand === "philips" ? "Philips ürün linki" : "IKEA ürün linki veya kodu";
  const placeholder = brand === "philips-hue" ? "https://www.philips-hue.com/tr-tr/p/..." : brand === "philips" ? "https://www.philips.com.tr/c-p/..." : "https://www.ikea.com/... veya 806.264.18";
  return <Card className="p-6 sm:p-8"><div className="mb-5"><h1 className="text-xl font-bold text-slate-950">Medya Oluştur</h1><p className="mt-1 text-sm text-slate-500">Önce markayı, ardından ürün bağlantısını seçin.</p></div><div className="mb-6 grid gap-3 sm:grid-cols-3">{brands.map((item) => <button key={item.id} type="button" disabled={busy} aria-pressed={brand === item.id} onClick={() => { setBrand(item.id); setValue(""); setError(""); }} className={cn("flex items-center gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60", brand === item.id ? "border-blue-600 bg-blue-50/70 shadow-sm ring-1 ring-blue-600" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white")}><span className="grid h-12 w-24 place-items-center rounded-xl bg-white p-2 shadow-sm"><Image src={item.logo} alt={`${item.label} logosu`} width={88} height={36} className="max-h-8 w-auto object-contain" /></span><span><span className="block font-bold text-slate-900">{item.label}</span><span className="mt-0.5 block text-xs text-slate-500">{item.description}</span></span></button>)}</div><form className="flex flex-col gap-3 sm:flex-row" onSubmit={async (event) => { event.preventDefault(); setError(""); if (!value.trim()) return setError(brand === "philips-hue" ? "Bir Philips Hue ürün linki girin." : brand === "philips" ? "Bir Philips ürün linki girin." : "Bir IKEA linki veya ürün kodu girin."); try { await onSubmit(brand, value.trim()); } catch (cause) { setError(cause instanceof Error ? cause.message : "İş başlatılamadı."); } }}><div className="flex-1"><label htmlFor="product-input" className="sr-only">{inputLabel}</label><Input id="product-input" type={requiresUrl ? "url" : "text"} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} placeholder={placeholder} aria-describedby={error ? "input-error" : undefined} aria-invalid={Boolean(error)} />{error && <p id="input-error" className="mt-2 text-sm font-medium text-red-600">{error}</p>}</div><Button className="h-12 shrink-0 px-6" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{busy ? "Başlatılıyor" : "Görselleri Hazırla"}</Button></form></Card>;
}
