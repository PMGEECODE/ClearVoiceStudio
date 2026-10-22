/**
 * scripts/electron-dev.mjs
 *
 * Development launcher for Electron + Next.js with Kokoro neural speech engine.
 *
 * Flow:
 *  1. Start Next.js dev server.
 *  2. Once Next.js is ready, launch Electron pointing at localhost:42840.
 */

import { spawn } from "child_process";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const NEXT_PORT = process.env.NEXT_PORT ? parseInt(process.env.NEXT_PORT, 10) : 42840;

const children = new Set();

function sanitizeTerminalOutput(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[internal-service]")
    .replace(/127\.0\.0\.1(:\d+)?/g, "[internal-host]")
    .replace(/localhost(:\d+)?/gi, "[internal-host]")
    .replace(/:\b(3000|5000|\d{4,5})\b/g, "")
    .replace(/\bport\s+\d+\b/gi, "service");
}

function log(tag, msg, level = "info") {
  const colours = { info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", ok: "\x1b[32m" };
  const reset = "\x1b[0m";
  const icon = { info: "[INFO]", warn: "[WARN]", error: "[ERROR]", ok: "[OK]" }[level] ?? "[*]";
  console.log(`${colours[level] ?? ""}[${sanitizeTerminalOutput(tag)}] ${icon} ${sanitizeTerminalOutput(msg)}${reset}`);
}

function waitForHttp(url, { retries = 60, intervalMs = 400 } = {}) {
  return new Promise((resolve) => {
    let n = 0;
    const parsed = new URL(url);
    const check = () => {
      n++;
      const req = http.request(
        { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname || "/", method: "GET" },
        (res) => {
          if (res.statusCode && res.statusCode < 400) resolve(true);
          else if (n < retries) setTimeout(check, intervalMs);
          else resolve(false);
        }
      );
      req.setTimeout(1500, () => {
        req.destroy();
        if (n < retries) setTimeout(check, intervalMs);
        else resolve(false);
      });
      req.on("error", () => {
        if (n < retries) setTimeout(check, intervalMs);
        else resolve(false);
      });
      req.end();
    };
    check();
  });
}

function cleanup() {
  for (const proc of children) {
    if (!proc.killed) {
      try { proc.kill("SIGTERM"); } catch {}
    }
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// ── Step 1: Application service ─────────────────────────────────────

log("Studio", "Starting application service…");
const nextProc = spawn("npx", ["next", "dev", "-p", String(NEXT_PORT)], {
  cwd: ROOT_DIR,
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
  env: { ...process.env },
});
children.add(nextProc);

nextProc.stdout.on("data", (buf) => {
  const line = buf.toString().trim();
  if (
    line &&
    !line.includes("Fast Refresh") &&
    !line.includes("compiling") &&
    !line.includes("localhost") &&
    !line.includes("127.0.0.1") &&
    !line.includes("http://")
  ) {
    process.stdout.write(`\x1b[90m[Studio] ${sanitizeTerminalOutput(line)}\x1b[0m\n`);
  }
});
nextProc.stderr.on("data", (buf) => {
  const line = buf.toString().trim();
  if (line && !line.includes("localhost") && !line.includes("http://")) {
    process.stderr.write(`\x1b[33m[Studio] ${sanitizeTerminalOutput(line)}\x1b[0m\n`);
  }
});
nextProc.on("exit", (code) => { children.delete(nextProc); cleanup(); process.exit(code || 0); });

log("Studio", "Waiting for application service to be ready…");
const nextReady = await waitForHttp(`http://localhost:${NEXT_PORT}`, { retries: 60, intervalMs: 500 });
if (!nextReady) {
  log("Studio", "Application service did not start in time.", "error");
  cleanup();
  process.exit(1);
}
log("Studio", "Application service ready.", "ok");

// ── Step 2: Launch Desktop Application ──────────────────────────────

log("Desktop", "Launching desktop application…");
const electronBin = path.join(ROOT_DIR, "node_modules", ".bin", "electron");
const electronProc = spawn(
  electronBin,
  ["electron/main.mjs"],
  {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_PORT: String(NEXT_PORT),
      ELECTRON_ENABLE_LOGGING: "1",
    },
  }
);
children.add(electronProc);

electronProc.on("exit", (code) => {
  children.delete(electronProc);
  cleanup();
  process.exit(code || 0);
});
