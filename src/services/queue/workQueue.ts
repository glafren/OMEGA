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
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export class WorkQueue {
  private readonly pending: PendingWork<unknown>[] = [];
  private readonly items = new Map<string, QueueWorkItem>();
  private running = 0;

  constructor(private readonly concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Kuyruk kapasitesi en az 1 olmalıdır.");
  }

  enqueue<T>(item: Pick<QueueWorkItem, "id" | "type" | "label">, task: () => Promise<T>): Promise<T> {
    if (this.items.has(item.id)) return Promise.reject(new Error(`İş zaten kuyrukta: ${item.id}`));
    const record: QueueWorkItem = { ...item, status: "queued", queuedAt: new Date().toISOString() };
    this.items.set(record.id, record);
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.push({ item: record, task, resolve, reject } as PendingWork<unknown>);
    });
    this.drain();
    return promise;
  }

  snapshot() {
    const items = [...this.items.values()].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    return { concurrency: this.concurrency, running: this.running, queued: items.filter((item) => item.status === "queued").length, items };
  }

  private drain() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const work = this.pending.shift()!;
      work.item.status = "running";
      work.item.startedAt = new Date().toISOString();
      this.running += 1;
      void work.task().then(work.resolve, work.reject).finally(() => {
        this.running -= 1;
        this.items.delete(work.item.id);
        this.drain();
      });
    }
  }
}

const queueCapacity = Math.max(1, Number.parseInt(process.env.OMEGA_QUEUE_CONCURRENCY || "2", 10) || 2);
const globalQueue = globalThis as typeof globalThis & { __omegaWorkQueue?: WorkQueue };
export const workQueue = globalQueue.__omegaWorkQueue ??= new WorkQueue(queueCapacity);
