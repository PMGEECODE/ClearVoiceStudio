import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const piperDir = process.env.PIPER_DIR || path.join(rootDir, "piper-tts");
const venvDir = path.join(piperDir, ".venv");

function resolvePython() {
  if (process.env.PYTHON_BIN && fs.existsSync(process.env.PYTHON_BIN)) {
    return process.env.PYTHON_BIN;
  }
  const venvUnix = path.join(venvDir, "bin", "python3");
  if (fs.existsSync(venvUnix)) return venvUnix;
  const venvWin = path.join(venvDir, "Scripts", "python.exe");
  if (fs.existsSync(venvWin)) return venvWin;

  const candidatePaths = [
    "/usr/local/bin/python3",
    "/usr/bin/python3",
    "/usr/local/bin/python",
    "/usr/bin/python",
  ];
  for (const c of candidatePaths) {
    if (fs.existsSync(c)) return c;
  }

  try {
    const which = execSync("which python3 || which python", { encoding: "utf-8" }).trim();
    if (which && fs.existsSync(which)) return which;
  } catch {}

  return "python3";
}

const pythonBin = resolvePython();

async function isServerOnline() {
  try {
    const res = await fetch("http://127.0.0.1:5000/info", { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

let piperProcess = null;

async function startPiperServer() {
  const alreadyRunning = await isServerOnline();
  if (alreadyRunning) {
    console.log("\x1b[32m%s\x1b[0m", "✓ Voice engine is already active");
    return;
  }

  let defaultModel = "en_US-lessac-medium.onnx";
  if (!fs.existsSync(path.join(piperDir, defaultModel))) {
    const files = fs.readdirSync(piperDir);
    const onnx = files.find((f) => f.endsWith(".onnx"));
    if (onnx) defaultModel = onnx;
  }

  console.log("\x1b[34m%s\x1b[0m", "[Engine] Starting voice engine...");

  piperProcess = spawn(
    pythonBin,
    [
      "-m",
      "piper.http_server",
      "-m",
      defaultModel,
      "--host",
      "127.0.0.1",
      "--data-dir",
      piperDir,
      "--data-dir",
      ".",
      "--port",
      "5000",
    ],
    {
      cwd: piperDir,
      stdio: "inherit",
    }
  );

  for (let i = 0; i < 75; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isServerOnline()) {
      console.log("\x1b[32m%s\x1b[0m", "✓ Voice engine ready");
      return;
    }
  }
  console.warn("\x1b[33m%s\x1b[0m", "[Engine] Voice engine warming up in background...");
}

function startNext(args) {
  console.log("\x1b[34m%s\x1b[0m", "[Studio] Starting application service...");
  const nextProcess = spawn("npx", ["next", "start", ...args], {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
  });

  const cleanup = () => {
    if (piperProcess && !piperProcess.killed) {
      console.log("\n[Shutdown] Stopping voice engine...");
      try {
        piperProcess.kill("SIGTERM");
      } catch {}
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  process.on("exit", cleanup);

  nextProcess.on("exit", (code) => {
    cleanup();
    process.exit(code || 0);
  });
}

await startPiperServer();
const extraArgs = process.argv.slice(2);
if (process.env.PORT && !extraArgs.includes("-p") && !extraArgs.includes("--port")) {
  extraArgs.push("-p", process.env.PORT);
}
startNext(extraArgs);
