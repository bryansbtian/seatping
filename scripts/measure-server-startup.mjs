import { spawnSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entryArgument = process.argv.slice(2).find((argument) => argument.startsWith("--entry="));
let entryPath = resolve("dist-server/server/index.js");
if (entryArgument) {
  entryPath = resolve(entryArgument.slice("--entry=".length));
}
const entry = pathToFileURL(entryPath).href;
const source = `
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const output = process.stdout.write.bind(process.stdout);
process.stdout.write = () => true;
process.stderr.write = () => true;
const started = performance.now();
await import(${JSON.stringify(entry)});
const coldImportMs = performance.now() - started;
const warmStarted = performance.now();
await import(${JSON.stringify(entry)});
const warmImportMs = performance.now() - warmStarted;
const cachedModules = Object.keys(require.cache);
output(JSON.stringify({ coldImportMs, warmImportMs, heapUsedBytes: process.memoryUsage().heapUsed, cachedModules: cachedModules.length }));
process.exit(0);
`;

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

const environment = {};
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"]) {
  if (process.env[key]) {
    environment[key] = process.env[key];
  }
}
Object.assign(environment, {
  VERCEL: "1",
  NODE_ENV: "test",
  DOTENV_CONFIG_PATH: resolve("test-results/nonexistent-startup-env"),
  DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/startup_test",
});

const samples = [];
for (let index = 0; index < 10; index++) {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.status !== 0) {
    throw new Error("Startup measurement failed. Run npm run build before measuring.");
  }
  samples.push(JSON.parse(result.stdout));
}

const serverEntry = await stat(entryPath);
const report = {
  event: "seatping.synthetic.startup",
  capturedAt: new Date().toISOString(),
  node: process.version,
  protocol: "Ten fresh Node processes, compiled Express import, no database or provider calls",
  samples: samples.length,
  rawSamples: samples,
  coldImportP50Ms: percentile(
    samples.map((sample) => sample.coldImportMs),
    0.5,
  ),
  coldImportP95Ms: percentile(
    samples.map((sample) => sample.coldImportMs),
    0.95,
  ),
  warmImportP50Ms: percentile(
    samples.map((sample) => sample.warmImportMs),
    0.5,
  ),
  warmImportP95Ms: percentile(
    samples.map((sample) => sample.warmImportMs),
    0.95,
  ),
  heapUsedP50Bytes: percentile(
    samples.map((sample) => sample.heapUsedBytes),
    0.5,
  ),
  compiledEntryBytes: serverEntry.size,
  cachedCommonJsModules: samples[0].cachedModules,
  vercelColdStartMs: "Not Measured",
  poolWaitMs: "Not Measured",
};
await mkdir("test-results", { recursive: true });
let label = "final";
if (process.env.SEATPING_BENCHMARK_BASELINE === "1" || process.argv.includes("--baseline")) {
  label = "before";
}
await writeFile(`test-results/server-startup-${label}.json`, JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
