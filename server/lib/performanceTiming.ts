import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import type { RequestHandler } from "express";

type DatabaseOperation =
  | "credit.lock"
  | "credit.business"
  | "credit.expire"
  | "credit.refill"
  | "credit.anchor"
  | "business.identity"
  | "business.locations"
  | "business.queue"
  | "business.reservations"
  | "business.badges";

type Timing = { calls: number; durationMs: number; affectedRows: number };
const timings = new AsyncLocalStorage<Map<DatabaseOperation, Timing>>();

export async function measureDatabase<T>(
  operation: DatabaseOperation,
  work: () => Promise<T>,
): Promise<T> {
  const context = timings.getStore();
  if (!context) {
    return work();
  }
  const start = performance.now();
  let affectedRows = 0;
  try {
    const result = await work();
    if (
      result &&
      typeof result === "object" &&
      "count" in result &&
      typeof result.count === "number"
    ) {
      affectedRows = result.count;
    }
    return result;
  } finally {
    const timing = context.get(operation) ?? { calls: 0, durationMs: 0, affectedRows: 0 };
    timing.calls++;
    timing.durationMs += performance.now() - start;
    timing.affectedRows += affectedRows;
    context.set(operation, timing);
  }
}

export const businessMeTiming: RequestHandler = (_req, res, next) => {
  if (process.env.PERFORMANCE_TIMINGS !== "1") {
    next();
    return;
  }
  let sampleRate = Number(process.env.PERFORMANCE_SAMPLE_RATE ?? "0.01");
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    sampleRate = 0.01;
  }
  if (Math.random() >= sampleRate) {
    next();
    return;
  }
  const context = new Map<DatabaseOperation, Timing>();
  const start = performance.now();
  res.once("finish", () => {
    console.info(
      JSON.stringify({
        event: "seatping.performance",
        operation: "business.me",
        status: res.statusCode,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        database: Object.fromEntries(context),
      }),
    );
  });
  timings.run(context, next);
};
