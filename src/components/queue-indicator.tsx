"use client";

import { ListTodo, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type QueueSnapshot = { running: number; queued: number; concurrency: number };

export function QueueIndicator() {
  const [queue, setQueue] = useState<QueueSnapshot>({ running: 0, queued: 0, concurrency: 2 });
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const response = await fetch("/api/queue", { cache: "no-store" }); if (response.ok && active) setQueue(await response.json()); } catch { /* Bir sonraki yoklamada tekrar dene. */ }
    };
    void load(); const timer = setInterval(() => void load(), 1500);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const busy = queue.running > 0 || queue.queued > 0;
  return <span title={`Kapasite: ${queue.concurrency}`} className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold sm:flex ${busy ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <ListTodo className="size-3.5" />}{queue.running} aktif{queue.queued > 0 ? ` · ${queue.queued} bekliyor` : ""}</span>;
}
