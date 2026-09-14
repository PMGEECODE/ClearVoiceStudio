import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const piperDir = path.join(rootDir, "piper-tts");
const venvDir = path.join(piperDir, ".venv");
const pythonBin = path.join(venvDir, "bin", "python3");
const pipBin = path.join(venvDir, "bin", "pip");

console.log("\x1b[36m%s\x1b[0m", "==================================================");
console.log("\x1b[36m%s\x1b[0m", "      🎙️  ClearVoice Studio - Startup Engine       ");
console.log("\x1b[36m%s\x1b[0m", "==================================================");

// 1. Ensure Python virtual environment exists
if (!fs.existsSync(pythonBin)) {
  console.log("\x1b[33m%s\x1b[0m", "[Setup] Initializing isolated runtime environment...");
  try {
    execSync(`python3 -m venv "${venvDir}"`, { stdio: "ignore" });
  } catch (err) {
    console.error("\x1b[31m%s\x1b[0m", "[Setup Error] Failed to initialize runtime environment:", err);
    process.exit(1);
  }
}

// 2. Ensure speech synthesis packages are installed
let isPiperInstalled = false;
try {
  const check = execSync(`"${pythonBin}" -c "import piper; import flask" 2>/dev/null`, { encoding: "utf-8" });
  isPiperInstalled = true;
} catch {
  isPiperInstalled = false;
}

if (!isPiperInstalled) {
  console.log("\x1b[33m%s\x1b[0m", "[Setup] Initializing voice engine dependencies...");
  const reqPath = path.join(piperDir, "requirements.txt");
  try {
    if (fs.existsSync(reqPath)) {
      execSync(`"${pipBin}" install -r "${reqPath}"`, { stdio: "ignore" });
    } else {
      execSync(`"${pipBin}" install "piper-tts[http]>=1.8.0"`, { stdio: "ignore" });
    }
  } catch (err) {
    console.error("\x1b[31m%s\x1b[0m", "[Setup Error] Failed to install voice dependencies:", err);
    process.exit(1);
  }
}

// 3. Start Voice Engine Server
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

  // Find default model
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

  piperProcess.stderr.on("data", (data) => {
    const msg = data.toString();
    if (msg.includes("ERROR") || msg.includes("CRITICAL")) {
      console.error("\x1b[31m[Engine Notice]\x1b[0m", msg.trim().replace(/:\d+/g, "").replace(/https?:\/\/[^\s]+/g, ""));
    }
  });

  // Wait for server ready
  let online = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isServerOnline()) {
      online = true;
      break;
    }
  }

  if (online) {
    console.log("\x1b[32m%s\x1b[0m", "✓ Voice engine ready");
  } else {
    console.warn("\x1b[33m%s\x1b[0m", "⚠ Voice engine standby mode active.");
  }
}

// 4. Start Next.js Client
function startNext(args) {
  console.log("\x1b[34m%s\x1b[0m", "[Studio] Launching studio application...");
  const nextProcess = spawn("npx", ["next", "dev", ...args], {
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

// Execute workflow
await startPiperServer();
const extraArgs = process.argv.slice(2);
startNext(extraArgs);
