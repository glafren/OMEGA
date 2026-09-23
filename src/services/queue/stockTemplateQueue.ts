import { randomUUID } from "node:crypto";
import { workQueue } from "./workQueue";

type StockTemplateState = Record<string, unknown> & {
  id: string;
  status: string;
  message: string;
  percent: number;
  backendId?: string;
  updatedAt: number;
};

const globalState = globalThis as typeof globalThis & { __omegaStockTemplateJobs?: Map<string, StockTemplateState> };
const jobs = globalState.__omegaStockTemplateJobs ??= new Map<string, StockTemplateState>();
const backendBase = "http://127.0.0.1:8010/api";

async function backendJson(path: string, init?: RequestInit) {
  const response = await fetch(`${backendBase}/${path}`, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Stok servisi işlemi başarısız oldu.");
  return data as Record<string, unknown>;
}

function update(id: string, values: Record<string, unknown>) {
  const current = jobs.get(id);
  if (current) jobs.set(id, { ...current, ...values, id, updatedAt: Date.now() } as StockTemplateState);
}

export function startQueuedStockTemplate() {
  const id = randomUUID();
  jobs.set(id, { id, status: "queued", message: "Merkezi kuyrukta bekliyor.", percent: 0, updatedAt: Date.now() });
  void workQueue.enqueue({ id, type: "stock-template", label: "Ozon stok şablonu" }, async () => {
    try {
      update(id, { status: "running", message: "Stok şablonu başlatılıyor." });
      const started = await backendJson("start-stock-template", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const backendId = String(started.id);
      update(id, { ...started, id, backendId });
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const status = await backendJson(`stock-template-status/${encodeURIComponent(backendId)}`);
        update(id, { ...status, id, backendId });
        if (status.status === "done" || status.status === "error") break;
      }
    } catch (error) {
      update(id, { status: "error", percent: 100, message: error instanceof Error ? error.message : "Şablon oluşturulamadı." });
    }
  });
  return jobs.get(id)!;
}

export function getQueuedStockTemplate(id: string) {
  return jobs.get(id);
}

export function getStockTemplateBackendId(id: string) {
  return jobs.get(id)?.backendId;
}
