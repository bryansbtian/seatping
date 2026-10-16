import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";
import { performance } from "node:perf_hooks";

let initialization: Promise<Express> | undefined;

function loadApp(): Promise<Express> {
  if (initialization) {
    return initialization;
  }
  const started = performance.now();
  let sampleRate = Number(process.env.PERFORMANCE_SAMPLE_RATE ?? "0.01");
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    sampleRate = 0.01;
  }
  const sampled = process.env.PERFORMANCE_TIMINGS === "1" && Math.random() < sampleRate;
  initialization = import("../dist-server/server/index.js")
    .then((module) => {
      if (sampled) {
        console.info(
          JSON.stringify({
            event: "seatping.performance",
            operation: "server.initialize",
            durationMs: Math.round((performance.now() - started) * 100) / 100,
          }),
        );
      }
      return module.default;
    })
    .catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await loadApp();
  return app(req, res);
}
