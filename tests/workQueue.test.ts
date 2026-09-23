import { describe, expect, it, vi } from "vitest";
import { WorkQueue } from "../src/services/queue/workQueue";

describe("WorkQueue", () => {
  it("kapasite doluyken sonraki işi bekletir ve sıra gelince çalıştırır", async () => {
    const queue = new WorkQueue(1);
    let releaseFirst!: () => void;
    const first = queue.enqueue({ id: "first", type: "media", label: "İlk iş" }, () => new Promise<void>((resolve) => { releaseFirst = resolve; }));
    const secondTask = vi.fn(async () => "tamam");
    const second = queue.enqueue({ id: "second", type: "label", label: "İkinci iş" }, secondTask);

    expect(queue.snapshot()).toMatchObject({ concurrency: 1, running: 1, queued: 1 });
    expect(secondTask).not.toHaveBeenCalled();

    releaseFirst();
    await first;
    await expect(second).resolves.toBe("tamam");
    expect(secondTask).toHaveBeenCalledOnce();
    expect(queue.snapshot()).toMatchObject({ running: 0, queued: 0, items: [] });
  });

  it("aynı kimliğin iki kez kuyruğa alınmasını engeller", async () => {
    const queue = new WorkQueue(1);
    let release!: () => void;
    const first = queue.enqueue({ id: "same", type: "stock-check", label: "Stok" }, () => new Promise<void>((resolve) => { release = resolve; }));
    await expect(queue.enqueue({ id: "same", type: "stock-check", label: "Stok" }, async () => undefined)).rejects.toThrow("İş zaten kuyrukta");
    release();
    await first;
  });
});
