import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const child = spawn(process.execPath, [cli, "watch", "server/index.ts"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", () => {
  console.error("Unable to start the development API.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
