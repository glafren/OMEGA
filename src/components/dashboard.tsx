"use client";
import { useCallback, useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { ProductInput } from "./product-input";
import { ProcessingCard } from "./processing-card";
import { ResultGallery } from "./result-gallery";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import type { JobEvent, JobRecord, ProductBrand } from "@/types";

const latestJobKey = "omega-latest-media-job";

export function Dashboard() {
  const [job, setJob] = useState<JobRecord | null>(null); const [event, setEvent] = useState<JobEvent | null>(null); const [starting, setStarting] = useState(false); const [canceling, setCanceling] = useState(false); const [retryingRichContent, setRetryingRichContent] = useState(false);
  const loadJob = useCallback(async (jobId: string) => { const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" }); if (!response.ok) throw new Error("İş bilgisi alınamadı."); const data = await response.json() as JobRecord; setJob(data); setEvent({ jobId, stage: data.stage, message: data.message, progress: data.progress, timestamp: data.updatedAt }); return data; }, []);
  useEffect(() => {
    localStorage.removeItem(latestJobKey);
    localStorage.removeItem("ikea-ozon-latest-job");
  }, []);
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed" || job.status === "canceled") return;
    const source = new EventSource(`/api/jobs/${job.jobId}/events`);
    source.onmessage = (message) => { const next = JSON.parse(message.data) as JobEvent; setEvent(next); if (next.stage === "COMPLETED" || next.stage === "ERROR") { source.close(); void loadJob(job.jobId); } };
    source.onerror = () => { source.close(); void loadJob(job.jobId); };
    return () => source.close();
  }, [job, loadJob]);
  const submit = async (brand: ProductBrand, input: string) => { setStarting(true); setCanceling(false); try { const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, input }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "İş başlatılamadı."); localStorage.setItem(latestJobKey, body.jobId); await loadJob(body.jobId); } finally { setStarting(false); } };
  const cancel = async () => { if (!job || canceling) return; setCanceling(true); try { await fetch(`/api/jobs/${job.jobId}/cancel`, { method: "POST" }); await loadJob(job.jobId); } finally { setCanceling(false); } };
  const retryRichContent = async () => { if (!job || retryingRichContent) return; setRetryingRichContent(true); try { await fetch(`/api/jobs/${job.jobId}/rich-content/retry`, { method: "POST" }); await loadJob(job.jobId); } finally { setRetryingRichContent(false); } };
  const reset = () => { localStorage.removeItem(latestJobKey); localStorage.removeItem("ikea-ozon-latest-job"); setJob(null); setEvent(null); };
  const recoverableRichContentFailure = job?.status === "failed" && job.error === "TRANSLATION_FAILED" && job.outputs.length > 0;
  return <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 lg:px-8 lg:py-12"><ProductInput busy={starting || job?.status === "processing" || job?.status === "queued"} onSubmit={submit} />{job?.status === "completed" || recoverableRichContentFailure ? <ResultGallery job={job} onReset={reset} onRecreate={() => void submit(job.brand || "ikea", job.input)} onRetryRichContent={() => void retryRichContent()} retryingRichContent={retryingRichContent} /> : event ? <><ProcessingCard event={event} brand={job?.brand} onCancel={job?.status === "processing" || job?.status === "queued" ? cancel : undefined} canceling={canceling} />{(job?.status === "failed" || job?.status === "canceled") && <div className="flex justify-end gap-2"><Button variant="secondary" onClick={reset}>Yeni Ürün</Button><Button onClick={() => void submit(job.brand || "ikea", job.input)}>Yeniden Dene</Button></div>}</> : <Card className="grid min-h-72 place-items-center p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-700"><ImageIcon className="size-7" /></span><h2 className="mt-4 font-bold text-slate-900">Henüz bir ürün hazırlanmadı</h2><p className="mt-1 text-sm text-slate-500">IKEA veya Philips markasını seçip ürün bilgisi girerek başlayın.</p></div></Card>}</main>;
}
