import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";

let piperProcess: ChildProcess | null = null;
export function getPiperChildProcess(): ChildProcess | null {
  return piperProcess;
}
let isStartingPiper = false;

/**
 * Returns the absolute directory where Piper models and virtual environment live.
 * Defaults to the self-contained ./piper-tts directory inside the repository.
 */
export function getPiperDir(): string {
  if (process.env.PIPER_DIR && fs.existsSync(process.env.PIPER_DIR)) {
    return process.env.PIPER_DIR;
  }
  // In a packaged Electron app, electron-builder places extraResources
  // (including piper-tts/) one level above the app code at process.resourcesPath.
  const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const electronResources = path.join(resourcesPath, "piper-tts");
    if (fs.existsSync(electronResources)) {
      return electronResources;
    }
  }
  const localRepoDir = path.resolve(process.cwd(), "piper-tts");
  if (fs.existsSync(localRepoDir)) {
    return localRepoDir;
  }
  const homeFallback = path.join(process.env.HOME || "/home/cdncode", "piper-tts");
  if (fs.existsSync(homeFallback)) {
    return homeFallback;
  }
  return localRepoDir;
}

/**
 * Returns the python executable within piper-tts .venv, or fallback to python3.
 */
export function getPiperPython(): string {
  const dir = getPiperDir();
  const venvPython = path.join(dir, ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return "python3";
}

export const PIPER_SERVER_URL = process.env.PIPER_SERVER_URL || "http://127.0.0.1:5000";

/**
 * Checks if the Piper HTTP server is currently responding.
 */
export async function isPiperServerAlive(timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${PIPER_SERVER_URL}/info`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensures that the Piper HTTP server is running.
 * If not running, launches it in the background using the self-contained venv and models.
 */
export async function ensurePiperServer(): Promise<boolean> {
  const alive = await isPiperServerAlive(1000);
  if (alive) {
    return true;
  }

  if (isStartingPiper) {
    // Wait briefly for existing spawn attempt
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await isPiperServerAlive(500)) return true;
    }
    return false;
  }

  isStartingPiper = true;

  try {
    const piperDir = getPiperDir();
    const pythonBin = getPiperPython();

    // Default primary model to load
    let defaultModel = "en_US-lessac-medium.onnx";
    if (!fs.existsSync(path.join(/* turbopackIgnore: true */ piperDir, defaultModel))) {
      // Find first onnx file in piperDir
      const files = fs.readdirSync(/* turbopackIgnore: true */ piperDir);
      const onnx = files.find((f) => f.endsWith(".onnx"));
      if (onnx) defaultModel = onnx;
    }

    const args = [
      "-m",
      "piper.http_server",
      "-m",
      defaultModel,
      "--data-dir",
      ".",
      "--port",
      "5000",
    ];

    const child = spawn(pythonBin, args, {
      cwd: piperDir,
      stdio: "ignore",
      detached: true,
    });

    child.unref();
    piperProcess = child;

    // Poll until ready up to 6 seconds
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await isPiperServerAlive(500)) {
        isStartingPiper = false;
        return true;
      }
    }
  } catch {
    // Failed to launch
  } finally {
    isStartingPiper = false;
  }

  return await isPiperServerAlive(1000);
}
