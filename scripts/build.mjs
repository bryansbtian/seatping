import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export function buildProduction() {
  const environment = { ...process.env, NODE_ENV: "production" };
  const commands = [
    [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)), "build"],
    [
      fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url)),
      "--project",
      "tsconfig.server.json",
    ],
  ];
  for (const command of commands) {
    const result = spawnSync(process.execPath, command, { env: environment, stdio: "inherit" });
    if (result.error || result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  buildProduction();
}
