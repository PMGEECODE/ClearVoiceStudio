/**
 * scripts/prepare-win-python.mjs
 *
 * Downloads the official standalone embedded Python 3.11 for Windows,
 * bootstraps pip, and pre-installs all piper-tts dependencies into
 * build-resources/win-python so the final installer ships a fully
 * self-contained runtime — zero internet access required on end-user machines.
 *
 * Strategy:
 *  1. Download python-3.11.9-embed-amd64.zip from python.org.
 *  2. Unzip into build-resources/win-python/.
 *  3. Patch python311._pth to enable site-packages (required for embedded dists).
 *  4. Bootstrap pip via get-pip.py using the Wine/Windows Python binary.
 *  5. pip install all dependencies from piper-tts/requirements.txt.
 *
 * On Linux build machines we call the embedded python.exe through Wine.
 * On Windows build machines we call it directly.
 *
 * NOTE: Wine must be available on Linux CI/dev machines to run this script.
 */

import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const WIN_PYTHON_DIR = path.join(ROOT_DIR, "build-resources", "win-python");
const PYTHON_ZIP_URL =
  "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip";
const GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py";

const IS_WIN = process.platform === "win32";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function runCmd(cmd, { cwd = ROOT_DIR, label = cmd } = {}) {
  console.log(`\x1b[36m[WinPython] ${label}…\x1b[0m`);
  const result = spawnSync(cmd, { cwd, shell: true, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${label}`);
  }
  console.log(`\x1b[32m[WinPython] ✓ ${label}\x1b[0m`);
}

/**
 * Download a URL to a local file path using Node's built-in https module,
 * following redirects automatically so we don't need curl/wget.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    function get(targetUrl) {
      https
        .get(targetUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Follow redirect
            res.resume();
            get(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
            return;
          }
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        })
        .on("error", (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
    }

    get(url);
  });
}

/**
 * Build the command to invoke the embedded python.exe.
 * On Linux, we need Wine; on Windows we call it directly.
 */
function buildPythonCmd(pythonExe) {
  if (IS_WIN) {
    return `"${pythonExe}"`;
  }
  // On Linux: check for Wine
  try {
    execSync("which wine", { stdio: "ignore" });
    return `wine "${pythonExe}"`;
  } catch {
    throw new Error(
      "Wine is required to pre-install Python packages when cross-compiling for Windows on Linux.\n" +
        "Install it with: sudo apt-get install wine"
    );
  }
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

export async function ensureWinPython() {
  const pythonExe = path.join(WIN_PYTHON_DIR, "python.exe");
  const pipExe = path.join(WIN_PYTHON_DIR, "Scripts", "pip.exe");
  const requirementsFile = path.join(ROOT_DIR, "piper-tts", "requirements.txt");

  // ── 1. Download and unzip embedded Python ───────────────
  if (!fs.existsSync(pythonExe)) {
    console.log("\x1b[36m[WinPython] Downloading standalone Windows Python 3.11…\x1b[0m");
    fs.mkdirSync(WIN_PYTHON_DIR, { recursive: true });

    const tempZip = path.join(ROOT_DIR, "build-resources", "python-embed.zip");
    await downloadFile(PYTHON_ZIP_URL, tempZip);

    runCmd(`unzip -q -o "${tempZip}" -d "${WIN_PYTHON_DIR}"`, {
      label: "Extracting Python runtime",
    });

    try {
      fs.rmSync(tempZip, { force: true });
    } catch {}
  } else {
    console.log("\x1b[32m[WinPython] ✓ Embedded Python already extracted.\x1b[0m");
  }

  // ── 2. Patch python311._pth to enable site-packages ─────
  // The embedded distribution ships with site-packages disabled by default.
  // We must uncomment "import site" in the _pth file to allow pip-installed
  // packages to be importable.
  const pthFiles = fs
    .readdirSync(WIN_PYTHON_DIR)
    .filter((f) => f.endsWith("._pth"));

  for (const pth of pthFiles) {
    const pthPath = path.join(WIN_PYTHON_DIR, pth);
    let content = fs.readFileSync(pthPath, "utf8");
    // Uncomment "#import site" → "import site"
    if (content.includes("#import site")) {
      content = content.replace(/#import site/g, "import site");
      fs.writeFileSync(pthPath, content, "utf8");
      console.log(`\x1b[32m[WinPython] ✓ Patched ${pth} to enable site-packages.\x1b[0m`);
    }
  }

  const pythonCmd = buildPythonCmd(pythonExe);

  // ── 3. Bootstrap pip ─────────────────────────────────────
  if (!fs.existsSync(pipExe)) {
    console.log("\x1b[36m[WinPython] Bootstrapping pip…\x1b[0m");
    const getPipPath = path.join(ROOT_DIR, "build-resources", "get-pip.py");
    await downloadFile(GET_PIP_URL, getPipPath);

    const getPipArg = IS_WIN ? `"${getPipPath}"` : `"Z:${getPipPath.replace(/\//g, "\\")}"`;
    runCmd(`${pythonCmd} ${getPipArg} --no-warn-script-location`, {
      label: "Installing pip into embedded Python",
      cwd: WIN_PYTHON_DIR,
    });

    try {
      fs.rmSync(getPipPath, { force: true });
    } catch {}
  } else {
    console.log("\x1b[32m[WinPython] ✓ pip already bootstrapped.\x1b[0m");
  }

  // ── 4. Install piper-tts dependencies ───────────────────
  // Check if piper is already installed by probing for the package directory
  const piperPkg = path.join(WIN_PYTHON_DIR, "Lib", "site-packages", "piper");
  if (!fs.existsSync(piperPkg)) {
    console.log("\x1b[36m[WinPython] Installing piper-tts and dependencies…\x1b[0m");

    // Use pip from Scripts/ — on Linux we need to invoke via Wine too
    let pipCmd;
    if (IS_WIN) {
      pipCmd = `"${pipExe}"`;
    } else {
      pipCmd = `wine "${pipExe}"`;
    }

    const requirementsArg = IS_WIN
      ? `"${requirementsFile}"`
      : `"Z:${requirementsFile.replace(/\//g, "\\")}"`;

    runCmd(
      `${pipCmd} install --no-warn-script-location -r ${requirementsArg}`,
      { label: "Installing piper-tts + onnxruntime + numpy<2 + flask" }
    );
  } else {
    console.log("\x1b[32m[WinPython] ✓ piper-tts packages already installed.\x1b[0m");
  }

  console.log(
    "\x1b[32m[WinPython] ✓ Standalone Windows Python runtime is fully ready.\x1b[0m"
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureWinPython().catch((err) => {
    console.error("\x1b[31m[WinPython] Fatal error:\x1b[0m", err.message || err);
    process.exit(1);
  });
}
