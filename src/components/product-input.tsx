"use client";
import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";

export function ProductInput({ busy, onSubmit }: { busy: boolean; onSubmit: (input: string) => Promise<void> }) {
  const [value, setValue] = useState(""); const [error, setError] = useState("");
  return <Card className="p-6 sm:p-8"><div className="mb-5"><h1 className="text-xl font-bold text-slate-950">IKEA Ürünü</h1><p className="mt-1 text-sm text-slate-500">Ürün linkini veya IKEA ürün kodunu girin.</p></div><form className="flex flex-col gap-3 sm:flex-row" onSubmit={async (event) => { event.preventDefault(); setError(""); if (!value.trim()) return setError("Bir IKEA linki veya ürün kodu girin."); try { await onSubmit(value.trim()); } catch (cause) { setError(cause instanceof Error ? cause.message : "İş başlatılamadı."); } }}><div className="flex-1"><label htmlFor="product-input" className="sr-only">IKEA ürün linki veya kodu</label><Input id="product-input" value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} placeholder="https://www.ikea.com/... veya 806.264.18" aria-describedby={error ? "input-error" : undefined} aria-invalid={Boolean(error)} />{error && <p id="input-error" className="mt-2 text-sm font-medium text-red-600">{error}</p>}</div><Button className="h-12 shrink-0 px-6" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{busy ? "Başlatılıyor" : "Görselleri Hazırla"}</Button></form></Card>;
}
