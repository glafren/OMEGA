"use client";
import { useCallback, useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { ProductInput } from "./product-input";
import { ProcessingCard } from "./processing-card";
import { ResultGallery } from "./result-gallery";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import type { JobEvent, JobRecord } from "@/types";

export function Dashboard() {
  const [job, setJob] = useState<JobRecord | null>(null); const [event, setEvent] = useState<JobEvent | null>(null); const [starting, setStarting] = useState(false);
  const loadJob = useCallback(async (jobId: string) => { const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" }); if (!response.ok) throw new Error("İş bilgisi alınamadı."); const data = await response.json() as JobRecord; setJob(data); setEvent({ jobId, stage: data.stage, message: data.message, progress: data.progress, timestamp: data.updatedAt }); return data; }, []);
  // Restores server-backed state after hydration; the update necessarily originates from this effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const jobId = localStorage.getItem("ikea-ozon-latest-job"); if (jobId) void loadJob(jobId).catch(() => localStorage.removeItem("ikea-ozon-latest-job")); }, [loadJob]);
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const source = new EventSource(`/api/jobs/${job.jobId}/events`);
    source.onmessage = (message) => { const next = JSON.parse(message.data) as JobEvent; setEvent(next); if (next.stage === "COMPLETED" || next.stage === "ERROR") { source.close(); void loadJob(job.jobId); } };
    source.onerror = () => { source.close(); void loadJob(job.jobId); };
    return () => source.close();
  }, [job, loadJob]);
  const submit = async (input: string) => { setStarting(true); try { const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "İş başlatılamadı."); localStorage.setItem("ikea-ozon-latest-job", body.jobId); await loadJob(body.jobId); } finally { setStarting(false); } };
  const reset = () => { localStorage.removeItem("ikea-ozon-latest-job"); setJob(null); setEvent(null); };
  return <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 lg:px-8 lg:py-12"><ProductInput busy={starting || job?.status === "processing" || job?.status === "queued"} onSubmit={submit} />{job?.status === "completed" ? <ResultGallery job={job} onReset={reset} onRecreate={() => void submit(job.input)} /> : event ? <><ProcessingCard event={event} />{job?.status === "failed" && <div className="flex justify-end gap-2"><Button variant="secondary" onClick={reset}>Yeni Ürün</Button><Button onClick={() => void submit(job.input)}>Yeniden Dene</Button></div>}</> : <Card className="grid min-h-72 place-items-center p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-700"><ImageIcon className="size-7" /></span><h2 className="mt-4 font-bold text-slate-900">Henüz bir ürün hazırlanmadı</h2><p className="mt-1 text-sm text-slate-500">IKEA ürün linkini yukarıdaki alana yapıştırarak başlayın.</p></div></Card>}</main>;
}
