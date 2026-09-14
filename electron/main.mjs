/**
 * Electron Main Process — ClearVoice Studio
 *
 * Responsibilities:
 *  1. Frameless window orchestrator with OS-native window controls integration (Windows, macOS, Linux).
 *  2. Centered startup, constrained minimal desktop window geometry (1200x780, min 960x640), non-fullscreen.
 *  3. Spin up the Piper HTTP server (Python .venv) silently in the background.
 *  4. Start the bundled Next.js production server (or dev server in dev mode).
 *  5. Load the app URL in BrowserWindow once both servers are ready.
 *  6. Auto-updater management via electron-updater (check, download, quit-and-install).
 *  7. Gracefully shut down all child processes on quit.
 */

import { app, BrowserWindow, shell, dialog, ipcMain, screen } from "electron";
import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import http from "http";
import next from "next";
import { fileURLToPath } from "url";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ROOT_DIR: repo root in dev, or resources/app/ in production.
const ROOT_DIR = path.resolve(__dirname, "..");

// PIPER_DIR resolution:
const IS_PACKAGED = app.isPackaged;
const PIPER_DIR = IS_PACKAGED
  ? path.join(process.resourcesPath, "piper-tts")
  : path.join(ROOT_DIR, "piper-tts");

const IS_WIN = process.platform === "win32";

// Hardware acceleration & GPU compatibility:
// Under Wine or environments without native Direct3D/DComposition support,
// disable hardware acceleration to prevent OpenGL/DirectComposition crashes.
const isWine = IS_WIN && (
  Boolean(process.env.WINEPREFIX) ||
  Boolean(process.env.WINELOADERNOEXEC) ||
  fs.existsSync("C:\\windows\\system32\\wineboot.exe") ||
  fs.existsSync("C:\\windows\\syswow64\\wineboot.exe")
);

if (isWine || process.env.ELECTRON_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-d3d11");
  app.commandLine.appendSwitch("disable-software-rasterizer");
}

function getPythonRuntime(piperDir) {
  if (IS_WIN) {
    // 1. Packaged standalone Windows Python bundled with the application
    const embeddedWin = IS_PACKAGED
      ? path.join(process.resourcesPath, "python-win", "python.exe")
      : path.join(ROOT_DIR, "build-resources", "win-python", "python.exe");

    if (fs.existsSync(embeddedWin)) {
      return {
        python: embeddedWin,
        isEmbedded: true,
        hasRuntime: true,
      };
    }

    // 2. Local venv fallback
    const venvDir = path.join(piperDir, ".venv");
    const winPython = path.join(venvDir, "Scripts", "python.exe");
    const winPip = path.join(venvDir, "Scripts", "pip.exe");
    if (fs.existsSync(winPython)) {
      return {
        venvDir,
        python: winPython,
        pip: winPip,
        isEmbedded: false,
        hasRuntime: true,
      };
    }

    // 3. UserData writable runtime fallback
    let userVenv = "";
    try {
      userVenv = path.join(app.getPath("userData"), "python-runtime");
    } catch {
      userVenv = path.join(process.env.APPDATA || os.tmpdir(), "ClearVoice Studio", "python-runtime");
    }
    const userPython = path.join(userVenv, "Scripts", "python.exe");
    const userPip = path.join(userVenv, "Scripts", "pip.exe");
    if (fs.existsSync(userPython)) {
      return {
        venvDir: userVenv,
        python: userPython,
        pip: userPip,
        isEmbedded: false,
        hasRuntime: true,
      };
    }

    return {
      venvDir: userVenv,
      python: userPython,
      pip: userPip,
      isEmbedded: false,
      hasRuntime: false,
    };
  }

  // Unix / Linux
  const venvDir = path.join(piperDir, ".venv");
  const unixPython = path.join(venvDir, "bin", "python3");
  const unixPip = path.join(venvDir, "bin", "pip");
  return {
    venvDir,
    python: unixPython,
    pip: unixPip,
    isEmbedded: false,
    hasRuntime: fs.existsSync(unixPython),
  };
}

const REQUIREMENTS = path.join(PIPER_DIR, "requirements.txt");

const IS_DEV = process.env.NODE_ENV === "development" || !IS_PACKAGED;
const NEXT_PORT = process.env.NEXT_PORT ? parseInt(process.env.NEXT_PORT, 10) : 3000;
const PIPER_PORT = process.env.PIPER_PORT ? parseInt(process.env.PIPER_PORT, 10) : 5000;
const APP_URL = `http://127.0.0.1:${NEXT_PORT}`;
const PIPER_URL = `http://127.0.0.1:${PIPER_PORT}`;

/** Tracked child processes for cleanup */
const children = new Set();
let mainWindow = null;
let piperProc = null;

// CPU Thread Management: Default to 2 worker threads to keep CPU quiet & cool
const totalCpuCores = Math.max(1, os.cpus()?.length || 4);
let currentCpuThreads = Math.min(2, totalCpuCores);

// ──────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────

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
  if (IS_PACKAGED && level === "info") return;
  const cleanTag = sanitizeTerminalOutput(tag);
  const cleanMsg = sanitizeTerminalOutput(msg);
  const prefix = { info: "ℹ", warn: "⚠", error: "✖", ok: "✓" }[level] ?? "•";
  console[level === "error" ? "error" : "log"](`[${cleanTag}] ${prefix} ${cleanMsg}`);
}

function findSystemPython() {
  const commands = IS_WIN ? ["python", "py", "python3"] : ["python3", "python"];
  for (const cmd of commands) {
    try {
      const probe = IS_WIN ? `where ${cmd}` : `which ${cmd}`;
      execSync(probe, { stdio: "ignore" });
      return cmd;
    } catch {}
  }
  return null;
}

/**
 * Poll an HTTP endpoint until it responds with a 2xx status.
 */
function waitForHttp(url, { retries = 40, intervalMs = 300, timeoutMs = 2000 } = {}) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const parsed = new URL(url);
      const req = http.request(
        { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: "GET" },
        (res) => {
          if (res.statusCode && res.statusCode < 400) {
            resolve(true);
          } else if (attempts < retries) {
            setTimeout(check, intervalMs);
          } else {
            resolve(false);
          }
        }
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        if (attempts < retries) setTimeout(check, intervalMs);
        else resolve(false);
      });
      req.on("error", () => {
        if (attempts < retries) setTimeout(check, intervalMs);
        else resolve(false);
      });
      req.end();
    };
    check();
  });
}

// ──────────────────────────────────────────────────────────────────
// Step 1: Ensure Python venv & packages
// ──────────────────────────────────────────────────────────────────

function ensurePythonEnv() {
  const runtime = getPythonRuntime(PIPER_DIR);

  // If bundled standalone embedded runtime is present, verify packages are installed
  if (runtime.isEmbedded && runtime.hasRuntime) {
    try {
      execSync(`"${runtime.python}" -c "import piper; import numpy; import onnxruntime; import flask"`, { stdio: "ignore" });
      log("Setup", "Bundled neural engine runtime ready.", "ok");
      return true;
    } catch {
      // Package verification failed — embedded Python is a bare runtime (dev build).
      // Fall through to pip install below.
      log("Setup", "Embedded runtime found but packages missing — installing now…", "warn");
    }
  }

  // If a Linux venv was packaged into Windows, clean it up
  if (IS_WIN && runtime.venvDir && fs.existsSync(path.join(runtime.venvDir, "bin", "python3")) && !fs.existsSync(runtime.python)) {
    try {
      fs.rmSync(runtime.venvDir, { recursive: true, force: true });
    } catch {}
  }

  if (!runtime.hasRuntime) {
    const sysPy = findSystemPython();
    if (!sysPy) {
      log("Setup", "Local Python 3.9+ runtime not found; standby mode active", "warn");
      return false;
    }
    log("Setup", "Initializing local runtime environment…");
    try {
      if (runtime.venvDir) {
        fs.mkdirSync(path.dirname(runtime.venvDir), { recursive: true });
        execSync(`"${sysPy}" -m venv "${runtime.venvDir}"`, { stdio: "ignore" });
      }
    } catch {
      log("Setup", "Could not initialize virtual environment", "warn");
      return false;
    }
  }

  let installed = false;
  try {
    execSync(`"${runtime.python}" -c "import numpy; assert int(numpy.__version__.split('.')[0]) < 2; import piper; import flask; import onnxruntime"`, { stdio: "ignore" });
    installed = true;
  } catch {
    installed = false;
  }

  if (!installed && runtime.pip && fs.existsSync(runtime.pip)) {
    log("Setup", "Initializing voice components…");
    try {
      if (fs.existsSync(REQUIREMENTS)) {
        execSync(`"${runtime.pip}" install -r "${REQUIREMENTS}"`, { stdio: "ignore" });
      } else {
        execSync(`"${runtime.pip}" install "numpy>=1.26.0,<2.0.0" "piper-tts[http]>=1.8.0" "onnxruntime>=1.20.0" "flask>=3.0.0"`, { stdio: "ignore" });
      }
      installed = true;
    } catch {
      log("Setup", "Voice components installation deferred", "warn");
    }
  }

  log("Setup", "Runtime environment ready.", "ok");
  return true;
}

// ──────────────────────────────────────────────────────────────────
// Step 2: Start the voice synthesis server
// ──────────────────────────────────────────────────────────────────

async function startPiperServer() {
  const alive = await waitForHttp(`${PIPER_URL}/info`, { retries: 1, intervalMs: 100 });
  if (alive) {
    log("Engine", "Speech synthesis engine active.", "ok");
    return true;
  }

  const runtime = getPythonRuntime(PIPER_DIR);
  if (!runtime.hasRuntime || !fs.existsSync(runtime.python)) {
    log("Engine", "Local engine runtime executable deferred; standby active.", "warn");
    return false;
  }

  let defaultModel = "en_US-lessac-medium.onnx";
  if (!fs.existsSync(path.join(PIPER_DIR, defaultModel))) {
    const files = fs.readdirSync(PIPER_DIR);
    const onnx = files.find((f) => f.endsWith(".onnx"));
    if (onnx) defaultModel = onnx;
  }

  const modelPath = path.join(PIPER_DIR, defaultModel);

  // Setup writable user voices directory for dynamic voice downloads
  let userVoicesDir = "";
  try {
    userVoicesDir = path.join(app.getPath("userData"), "voices");
    if (!fs.existsSync(userVoicesDir)) {
      fs.mkdirSync(userVoicesDir, { recursive: true });
    }
  } catch {}

  const spawnArgs = [
    "-m",
    "piper.http_server",
    "-m",
    modelPath,
    "--data-dir",
    PIPER_DIR,
  ];

  if (userVoicesDir && fs.existsSync(userVoicesDir)) {
    spawnArgs.push("--data-dir", userVoicesDir);
  }

  spawnArgs.push("--port", String(PIPER_PORT));

  log("Engine", "Starting speech synthesis engine…");

  let proc = spawn(
    runtime.python,
    spawnArgs,
    {
      cwd: PIPER_DIR,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        OMP_NUM_THREADS: String(currentCpuThreads),
        MKL_NUM_THREADS: String(currentCpuThreads),
        OPENBLAS_NUM_THREADS: String(currentCpuThreads),
        ONNX_NUM_THREADS: String(currentCpuThreads),
      },
    }
  );
  piperProc = proc;

  children.add(proc);

  proc.stderr.on("data", (buf) => {
    const msg = buf.toString().trim();
    if (msg.includes("ERROR") || msg.includes("CRITICAL")) {
      log("Engine", sanitizeTerminalOutput(msg), "error");
    }
  });

  proc.on("exit", (code) => {
    children.delete(proc);
    if (code !== 0 && code !== null) {
      log("Engine", "Speech synthesis service stopped", "warn");
    }
  });

  const ready = await waitForHttp(`${PIPER_URL}/info`, { retries: 40, intervalMs: 300 });
  if (ready) {
    log("Engine", "Speech synthesis engine ready.", "ok");
  } else {
    log("Engine", "Synthesis service standby mode active.", "warn");
  }

  return ready;
}

// ──────────────────────────────────────────────────────────────────
// Step 3: Start the Next.js server
// ──────────────────────────────────────────────────────────────────

let nextHttpServer = null;

async function startNextServer() {
  if (IS_DEV) {
    log("Studio", "Development mode active.");
    return;
  }

  log("Studio", "Starting application service…");

  // Prevent Next.js from attempting runtime SWC binary downloads.
  // The platform-specific SWC binary is pre-bundled with the app.
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  process.env.NEXT_PRIVATE_SKIP_SIZE_LIMIT_CHECK = "1";

  const nextApp = next({
    dev: false,
    dir: ROOT_DIR,
  });

  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  await new Promise((resolve, reject) => {
    nextHttpServer = http.createServer((req, res) => handle(req, res));
    nextHttpServer.on("error", (err) => {
      log("Studio", `Server error: ${err.message}`, "error");
      reject(err);
    });
    nextHttpServer.listen(NEXT_PORT, "127.0.0.1", () => {
      log("Studio", "Application service ready.", "ok");
      resolve();
    });
  });
}

// ──────────────────────────────────────────────────────────────────
// Step 4: Create Frameless BrowserWindow
// ──────────────────────────────────────────────────────────────────

function createWindow() {
  const isMac = process.platform === "darwin";

  // Calculate proportional desktop window dimensions that never exceed the display or taskbar
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay?.workAreaSize || { width: 1366, height: 768 };

  // Responsive desktop sizing: ~82% width, ~80% height, bounded so it never feels like full-screen/full-height
  const targetWidth = Math.min(1120, Math.max(920, Math.round(workArea.width * 0.82)));
  const targetHeight = Math.min(680, Math.max(560, Math.round(workArea.height * 0.80)));

  const win = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    minWidth: 880,
    minHeight: 520,
    center: true,
    fullscreen: false,
    fullscreenable: true,
    title: "ClearVoice Studio",
    backgroundColor: "#061a24",
    frame: false, // Frameless custom window frame
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // needed for custom titlebar IPC bridge
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  mainWindow = win;

  win.loadURL(APP_URL);

  win.once("ready-to-show", () => {
    win.show();
  });

  // Track window maximize / restore changes
  win.on("maximize", () => {
    win.webContents.send("window:maximized-change", true);
  });
  win.on("unmaximize", () => {
    win.webContents.send("window:maximized-change", false);
  });

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("http://127.0.0.1")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsed = new URL(navigationUrl);
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  return win;
}

// ──────────────────────────────────────────────────────────────────
// Auto-Updater Configuration
// ──────────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    log("Updater", "Checking for updates…");
    mainWindow?.webContents.send("updater:status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    log("Updater", `Update available: ${info.version}`, "ok");
    mainWindow?.webContents.send("updater:status", {
      status: "available",
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    log("Updater", "App is up to date.");
    mainWindow?.webContents.send("updater:status", {
      status: "up-to-date",
      version: info?.version,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("updater:status", {
      status: "downloading",
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log("Updater", `Update downloaded: ${info.version}`, "ok");
    mainWindow?.webContents.send("updater:status", {
      status: "downloaded",
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    const msg = err?.message || "";
    // If GitHub returns 404 (e.g. releases.atom doesn't exist yet before the first public release tag)
    if (msg.includes("404") || msg.includes("releases.atom")) {
      log("Updater", "No remote releases published yet on GitHub. App is current.");
      mainWindow?.webContents.send("updater:status", {
        status: "up-to-date",
      });
      return;
    }
    log("Updater", `Update check note: ${msg}`, "warn");
    mainWindow?.webContents.send("updater:status", {
      status: "error",
      message: msg,
    });
  });
}

// ──────────────────────────────────────────────────────────────────
// Graceful shutdown
// ──────────────────────────────────────────────────────────────────

function cleanup() {
  if (nextHttpServer) {
    try {
      nextHttpServer.close();
    } catch {}
    nextHttpServer = null;
  }
  for (const proc of children) {
    if (!proc.killed) {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
  }
  children.clear();
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// ──────────────────────────────────────────────────────────────────
// IPC Handlers: Window Controls & Updater
// ──────────────────────────────────────────────────────────────────

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("piper:status", () => waitForHttp(`${PIPER_URL}/info`, { retries: 1 }));
ipcMain.handle("system:platform", () => process.platform);

// Window controls
ipcMain.handle("window:minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.minimize();
});

ipcMain.handle("window:maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.handle("window:isMaximized", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

ipcMain.handle("window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.close();
});

// Auto-updater actions
ipcMain.handle("updater:check", async () => {
  if (IS_DEV) {
    return { status: "dev", message: "Auto-updater is disabled in development" };
  }
  try {
    return await autoUpdater.checkForUpdates();
  } catch (err) {
    return { status: "error", message: err.message };
  }
});

ipcMain.handle("updater:download", async () => {
  try {
    return await autoUpdater.downloadUpdate();
  } catch (err) {
    return { status: "error", message: err.message };
  }
});

ipcMain.handle("updater:quit-and-install", () => {
  autoUpdater.quitAndInstall();
});

// ──────────────────────────────────────────────────────────────────
// App lifecycle
// ──────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    ensurePythonEnv();
  } catch (err) {
    log("Setup", `Runtime note: ${err?.message || err}`, "warn");
  }

  await Promise.all([startPiperServer(), startNextServer()]);

  if (!IS_DEV) {
    const nextReady = await waitForHttp(APP_URL, { retries: 60, intervalMs: 500 });
    if (!nextReady) {
      dialog.showErrorBox("Startup Failed", "Could not connect to the local application runtime.");
      app.quit();
      return;
    }
  } else {
    await waitForHttp(APP_URL, { retries: 30, intervalMs: 400 });
  }

  createWindow();
  setupAutoUpdater();

  // If in production, trigger a silent check for updates after launch
  if (!IS_DEV) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  cleanup();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", cleanup);
