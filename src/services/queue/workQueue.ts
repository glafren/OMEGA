export type QueueWorkType = "media" | "stock-check" | "stock-template" | "label";
export type QueueWorkStatus = "queued" | "running";

export interface QueueWorkItem {
  id: string;
  type: QueueWorkType;
  label: string;
  status: QueueWorkStatus;
  queuedAt: string;
  startedAt?: string;
}

interface PendingWork<T> {
  item: QueueWorkItem;
  task: (signal: AbortSignal) => Promise<T>;
  controller: AbortController;
  upstreamSignal?: AbortSignal;
  abortListener?: () => void;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export class WorkQueue {
  private readonly pending: PendingWork<unknown>[] = [];
  private readonly active = new Map<string, PendingWork<unknown>>();
  private readonly items = new Map<string, QueueWorkItem>();
  private running = 0;

  constructor(private readonly concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Kuyruk kapasitesi en az 1 olmalıdır.");
  }

  enqueue<T>(item: Pick<QueueWorkItem, "id" | "type" | "label">, task: (signal: AbortSignal) => Promise<T>, options: { signal?: AbortSignal } = {}): Promise<T> {
    if (this.items.has(item.id)) return Promise.reject(new Error(`İş zaten kuyrukta: ${item.id}`));
    const record: QueueWorkItem = { ...item, status: "queued", queuedAt: new Date().toISOString() };
    const controller = new AbortController();
    this.items.set(record.id, record);
    if (options.signal?.aborted) {
      this.items.delete(record.id);
      return Promise.reject(abortError());
    }
    const promise = new Promise<T>((resolve, reject) => {
      const pendingWork = { item: record, task, controller, upstreamSignal: options.signal, resolve, reject } as PendingWork<unknown>;
      pendingWork.abortListener = () => {
        controller.abort();
        if (record.status === "queued") {
          const index = this.pending.indexOf(pendingWork);
          if (index >= 0) this.pending.splice(index, 1);
          this.items.delete(record.id);
          reject(abortError());
        }
      };
      options.signal?.addEventListener("abort", pendingWork.abortListener, { once: true });
      this.pending.push(pendingWork);
    });
    this.drain();
    return promise;
  }

  snapshot() {
    const items = [...this.items.values()].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    return { concurrency: this.concurrency, running: this.running, queued: items.filter((item) => item.status === "queued").length, items };
  }

  cancel(id: string) {
    const item = this.items.get(id);
    if (!item) return false;
    const pending = this.pending.find((work) => work.item.id === id);
    if (pending) {
      pending.controller.abort();
      const index = this.pending.indexOf(pending);
      if (index >= 0) this.pending.splice(index, 1);
      this.items.delete(id);
      pending.reject(abortError());
      return true;
    }
    if (item.status === "running") {
      const running = this.active.get(id);
      running?.controller.abort();
      return true;
    }
    return false;
  }

  private drain() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const work = this.pending.shift()!;
      work.item.status = "running";
      work.item.startedAt = new Date().toISOString();
      this.active.set(work.item.id, work);
      this.running += 1;
      void work.task(work.controller.signal).then(work.resolve, work.reject).finally(() => {
        if (work.abortListener) work.upstreamSignal?.removeEventListener("abort", work.abortListener);
        this.active.delete(work.item.id);
        this.running -= 1;
        this.items.delete(work.item.id);
        this.drain();
      });
    }
  }
}

function abortError() {
  return new DOMException("İşlem durduruldu.", "AbortError");
}

const queueCapacity = Math.max(1, Number.parseInt(process.env.OMEGA_QUEUE_CONCURRENCY || "2", 10) || 2);
const globalQueue = globalThis as typeof globalThis & { __omegaWorkQueue?: WorkQueue };
const existingQueue = globalQueue.__omegaWorkQueue as (WorkQueue & { cancel?: (id: string) => boolean }) | undefined;
export const workQueue = existingQueue && typeof existingQueue.cancel === "function"
  ? existingQueue
  : (globalQueue.__omegaWorkQueue = new WorkQueue(queueCapacity));
