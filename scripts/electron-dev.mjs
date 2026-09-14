/**
 * scripts/electron-dev.mjs
 *
 * Development launcher for Electron + Next.js + Piper TTS.
 *
 * Flow:
 *  1. Ensure Python venv and piper-tts packages are installed.
 *  2. Start the Piper HTTP server.
 *  3. Start Next.js dev server (next dev).
 *  4. Once Next.js is ready, launch Electron pointing at localhost:3000.
 */

import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PIPER_DIR = path.join(ROOT_DIR, "piper-tts");
const VENV_PYTHON = path.join(PIPER_DIR, ".venv", "bin", "python3");
const PIP_BIN = path.join(PIPER_DIR, ".venv", "bin", "pip");
const REQUIREMENTS = path.join(PIPER_DIR, "requirements.txt");
const NEXT_PORT = 3000;
const PIPER_PORT = 5000;

const children = new Set();

function sanitizeTerminalOutput(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[internal-service]")
    .replace(/127\.0\.0\.1(:\d+)?/g, "[internal-host]")
    .replace(/localhost(:\d+)?/gi, "[internal-host]")
    .replace(/:\b(3000|5000|\d{4,5})\b/g, "")
    .replace(/\bport\s+\d+\b/gi, "service")
    .replace(/\bpiper[-_]?[a-z0-9]*/gi, "engine");
}

function log(tag, msg, level = "info") {
  const colours = { info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", ok: "\x1b[32m" };
  const reset = "\x1b[0m";
  const icon = { info: "ℹ", warn: "⚠", error: "✖", ok: "✓" }[level] ?? "•";
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

// ── Step 1: Runtime environment ───────────────────────────────────

if (!fs.existsSync(VENV_PYTHON)) {
  log("Setup", "Initializing local runtime environment…");
  execSync(`python3 -m venv "${path.join(PIPER_DIR, ".venv")}"`, { stdio: "ignore" });
}

let piperInstalled = false;
try {
  execSync(`"${VENV_PYTHON}" -c "import piper; import flask"`, { stdio: "ignore" });
  piperInstalled = true;
} catch { piperInstalled = false; }

if (!piperInstalled) {
  log("Setup", "Initializing voice synthesis components…");
  if (fs.existsSync(REQUIREMENTS)) {
    execSync(`"${PIP_BIN}" install -r "${REQUIREMENTS}"`, { stdio: "ignore" });
  } else {
    execSync(`"${PIP_BIN}" install "piper-tts[http]>=1.8.0"`, { stdio: "ignore" });
  }
}
log("Setup", "Runtime environment ready.", "ok");

// ── Step 2: Speech synthesis engine ────────────────────────────────

const piperAlready = await waitForHttp(`http://127.0.0.1:${PIPER_PORT}/info`, { retries: 1, intervalMs: 100 });
if (piperAlready) {
  log("Engine", "Speech synthesis engine active.", "ok");
} else {
  let defaultModel = "en_US-lessac-medium.onnx";
  if (!fs.existsSync(path.join(PIPER_DIR, defaultModel))) {
    const onnx = fs.readdirSync(PIPER_DIR).find((f) => f.endsWith(".onnx"));
    if (onnx) defaultModel = onnx;
  }

  log("Engine", "Starting speech synthesis engine…");
  const piperProc = spawn(
    VENV_PYTHON,
    ["-m", "piper.http_server", "-m", defaultModel, "--data-dir", ".", "--port", String(PIPER_PORT)],
    { cwd: PIPER_DIR, stdio: ["ignore", "ignore", "pipe"] }
  );
  children.add(piperProc);

  piperProc.stderr.on("data", (buf) => {
    const msg = buf.toString().trim();
    if (msg.includes("ERROR") || msg.includes("CRITICAL")) log("Engine", msg, "error");
  });
  piperProc.on("exit", () => { children.delete(piperProc); });

  const piperReady = await waitForHttp(`http://127.0.0.1:${PIPER_PORT}/info`);
  log("Engine", piperReady ? "Speech synthesis engine ready." : "Standby synthesis mode active.", piperReady ? "ok" : "warn");
}

// ── Step 3: Application service ────────────────────────────────────

log("Studio", "Starting application service…");
const nextProc = spawn("npx", ["next", "dev", "-p", String(NEXT_PORT)], {
  cwd: ROOT_DIR,
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
  env: { ...process.env, PIPER_SERVER_URL: `http://127.0.0.1:${PIPER_PORT}` },
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

// ── Step 4: Launch Desktop Application ─────────────────────────────

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
      PIPER_PORT: String(PIPER_PORT),
      PIPER_SERVER_URL: `http://127.0.0.1:${PIPER_PORT}`,
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
