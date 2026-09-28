"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clipboard, FileJson, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export function RichContentPreview({ jobId, blockCount, model, totalTokens }: { jobId: string; blockCount: number; model?: string; totalTokens?: number }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/jobs/${jobId}/rich-content`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Rich Content alınamadı.");
        const data = await response.json();
        setContent(JSON.stringify(data, null, 2));
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError("Rich Content önizlemesi yüklenemedi.");
      });
    return () => controller.abort();
  }, [jobId]);

  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      textareaRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return <Card className="mt-8 overflow-hidden">
    <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><FileJson className="size-5" /></span>
        <div><h3 className="font-bold text-slate-950">Ozon Rich Content JSON</h3><p className="text-sm text-slate-500">{blockCount} blok · Rusça{model ? ` · ${model}` : ""}{totalTokens ? ` · ${totalTokens.toLocaleString("tr-TR")} token` : ""} · Kopyalamaya hazır</p></div>
      </div>
      <Button onClick={() => void copy()} disabled={!content}>{copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}{copied ? "Kopyalandı" : "JSON'u Kopyala"}</Button>
    </div>
    <div className="p-5 sm:p-6">
      {error ? <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"><AlertCircle className="size-5" />{error}</div> : content ? <textarea ref={textareaRef} aria-label="Ozon Rich Content JSON önizlemesi" readOnly spellCheck={false} value={content} className="h-[32rem] w-full resize-y rounded-xl border border-slate-200 bg-slate-950 p-5 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /> : <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="size-5 animate-spin text-blue-700" />JSON yükleniyor...</div>}
    </div>
  </Card>;
}
