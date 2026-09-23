import { EventEmitter } from "node:events";
import type { JobEvent } from "@/types";

const globalKey = Symbol.for("ikea-ozon.job-events");
const globals = globalThis as typeof globalThis & { [globalKey]?: EventEmitter };
export const jobEvents = globals[globalKey] ?? (globals[globalKey] = new EventEmitter());
jobEvents.setMaxListeners(100);
export const eventName = (jobId: string) => `job:${jobId}`;
export const emitJobEvent = (event: JobEvent) => jobEvents.emit(eventName(event.jobId), event);
