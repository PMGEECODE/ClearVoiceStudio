import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const piperDir = path.join(rootDir, "piper-tts");
const venvDir = path.join(piperDir, ".venv");
const pythonBin = path.join(venvDir, "bin", "python3");

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
      "--data-dir",
      ".",
      "--port",
      "5000",
    ],
    {
      cwd: piperDir,
      stdio: ["ignore", "ignore", "pipe"],
    }
  );

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isServerOnline()) {
      console.log("\x1b[32m%s\x1b[0m", "✓ Voice engine ready");
      return;
    }
  }
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
startNext(extraArgs);
