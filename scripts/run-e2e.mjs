import { spawn } from "node:child_process";
import { once } from "node:events";
import { connect } from "node:net";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import config from "../playwright.config.ts";

const servers = [];
let testProcess;
let interrupted = false;

async function listening(port) {
  return new Promise((resolvePort) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolvePort(true);
    });
    socket.once("error", () => resolvePort(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolvePort(false);
    });
  });
}

async function startServer(server) {
  if (await listening(server.port)) {
    throw new Error(`E2E port ${server.port} is already in use`);
  }
  const command = server.command.split(" ");
  if (command.shift() !== "node") {
    throw new Error("E2E servers must use direct Node entry points");
  }
  const child = spawn(process.execPath, command, {
    env: { ...process.env, ...server.env },
    stdio: "inherit",
    shell: false,
  });
  servers.push(child);
  let failure;
  child.once("error", (error) => {
    failure = error;
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (interrupted) {
      throw new Error("E2E run interrupted");
    }
    if (failure) {
      throw failure;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("E2E server exited before becoming ready");
    }
    if (await listening(server.port)) {
      return;
    }
    await setTimeout(100);
  }
  throw new Error("E2E server readiness timed out");
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await Promise.race([exited, setTimeout(5000, undefined, { ref: false })]);
}

async function run() {
  const args = process.argv.slice(2);
  const environment = { ...process.env };
  if (!environment.E2E_BASE_URL && !args.includes("--list")) {
    const definitions = config.webServer ?? [];
    for (const server of definitions) {
      await startServer(server);
    }
  }
  environment.E2E_BASE_URL = config.use.baseURL;
  testProcess = spawn(
    process.execPath,
    [resolve("node_modules/@playwright/test/cli.js"), "test", ...args],
    { env: environment, stdio: "inherit", shell: false },
  );
  const [code] = await once(testProcess, "exit");
  return code ?? 1;
}

function interrupt() {
  interrupted = true;
  if (testProcess) {
    testProcess.kill("SIGKILL");
  }
}

process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  process.exitCode = await run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopChild(testProcess);
  await Promise.all(servers.map(stopChild));
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
