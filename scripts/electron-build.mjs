/**
 * scripts/electron-build.mjs
 *
 * Production build script:
 *  1. Checks previous versions and automatically updates versioning.
 *  2. Separates distribution outputs into platform-specific directories:
 *     - Linux:   dist-electron/linux
 *     - Windows: dist-electron/win
 *     - macOS:   dist-electron/mac
 *  3. Prevents cross-platform file deletion (Windows files are untouched during Linux builds, and vice versa).
 *  4. Builds Next.js and packages with electron-builder.
 *
 * Run:
 *  npm run electron:build:linux   (--linux)
 *  npm run electron:build:win     (--win)
 *  npm run electron:build         (all/default)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

function run(cmd, label) {
  console.log(`\x1b[36m[Build] ${label}…\x1b[0m`);
  execSync(cmd, { cwd: ROOT_DIR, stdio: "inherit" });
  console.log(`\x1b[32m[Build] ✓ ${label} complete.\x1b[0m`);
}

function parseSemver(v) {
  if (!v) return null;
  const match = String(v).match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function bumpPatch(v) {
  const parsed = parseSemver(v);
  if (!parsed) return "0.1.1";
  return `${parsed[0]}.${parsed[1]}.${parsed[2] + 1}`;
}

function getExistingArtifactVersions(dir) {
  const versions = new Set();
  if (!fs.existsSync(dir)) return [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const m = file.match(/(?:ClearVoiceStudio-|ClearVoiceStudio-Setup-|clearvoice-studio_|piper-tts-studio-)?v?(\d+\.\d+\.\d+)/);
      if (m && parseSemver(m[1])) {
        versions.add(m[1]);
      }
    }
  } catch {}
  return Array.from(versions);
}

// 1. Parse CLI arguments
const rawArgs = process.argv.slice(2);
const isWin = rawArgs.some((a) => a === "--win" || a === "-w" || a.startsWith("--win="));
const isLinux = rawArgs.some((a) => a === "--linux" || a === "-l" || a.startsWith("--linux="));
const isMac = rawArgs.some((a) => a === "--mac" || a === "-m" || a.startsWith("--mac="));

let platformSubdir = "";
if (isWin) platformSubdir = "win";
else if (isLinux) platformSubdir = "linux";
else if (isMac) platformSubdir = "mac";

let explicitVersion = null;
let forceBump = false;
let noBump = false;
const forwardedArgs = [];

for (const arg of rawArgs) {
  if (arg.startsWith("--app-version=")) {
    explicitVersion = arg.split("=")[1];
  } else if (arg.startsWith("--version=")) {
    explicitVersion = arg.split("=")[1];
  } else if (arg === "--bump") {
    forceBump = true;
  } else if (arg === "--no-bump") {
    noBump = true;
  } else {
    forwardedArgs.push(arg);
  }
}

// 2. Resolve versioning
const pkgPath = path.join(ROOT_DIR, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const currentVersion = pkg.version || "0.1.0";

const distRoot = path.join(ROOT_DIR, "dist-electron");
const targetDistDir = platformSubdir ? path.join(distRoot, platformSubdir) : distRoot;

// Gather versions from package.json, dist root, and platform dist folders
const allKnownVersions = new Set([currentVersion]);
for (const v of getExistingArtifactVersions(distRoot)) allKnownVersions.add(v);
for (const v of getExistingArtifactVersions(path.join(distRoot, "linux"))) allKnownVersions.add(v);
for (const v of getExistingArtifactVersions(path.join(distRoot, "win"))) allKnownVersions.add(v);
for (const v of getExistingArtifactVersions(path.join(distRoot, "mac"))) allKnownVersions.add(v);

const sortedVersions = Array.from(allKnownVersions).sort(compareSemver);
const highestKnownVersion = sortedVersions[sortedVersions.length - 1];

// Check if current target distribution directory or dist root already has an artifact with the current version
const targetExistingVersions = new Set([
  ...getExistingArtifactVersions(targetDistDir),
  ...getExistingArtifactVersions(distRoot),
]);
const alreadyBuiltForTarget = targetExistingVersions.has(currentVersion);

let targetVersion = currentVersion;
if (explicitVersion) {
  targetVersion = explicitVersion;
} else if (noBump) {
  targetVersion = currentVersion;
} else if (forceBump || alreadyBuiltForTarget) {
  // Check previous version and automatically update to the next patch version
  targetVersion = bumpPatch(highestKnownVersion);
}

if (pkg.version !== targetVersion) {
  pkg.version = targetVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`\x1b[35m[Build] Updated version: ${currentVersion} → ${targetVersion} (target: ${platformSubdir || "all"})\x1b[0m`);
} else {
  console.log(`\x1b[35m[Build] Building version: ${targetVersion} (target: ${platformSubdir || "all"})\x1b[0m`);
}

// 3. Prepare platform-specific output directory
fs.mkdirSync(targetDistDir, { recursive: true });

// Safe cleanup: only remove temporary staging folders and old versioned installers
// inside the TARGET platform directory. NEVER delete files belonging to other platforms!
try {
  if (fs.existsSync(targetDistDir)) {
    for (const file of fs.readdirSync(targetDistDir)) {
      const fullPath = path.join(targetDistDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        // Remove staging dirs (AppImage staging, win/linux unpacked staging)
        if (file.startsWith("__appImage-") || file.endsWith("-unpacked")) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      } else {
        // Remove old installer artifacts to prevent ETXTBSY locks on next build
        const ext = path.extname(file).toLowerCase();
        if (
          ext === ".exe" ||
          ext === ".appimage" ||
          ext === ".deb" ||
          ext === ".rpm" ||
          file.endsWith(".blockmap") ||
          file.endsWith(".nsis.7z")
        ) {
          fs.rmSync(fullPath, { force: true });
        }
      }
    }
  }
} catch {}

// 4. Build Next.js and package
run("node scripts/sync-icons.mjs", "Synchronizing Windows, Linux and runtime application icons");
run("node scripts/patch-transformers.mjs", "Applying bundler compatibility patches");
run("node scripts/bundle-whisper.mjs", "Staging offline Whisper and Kokoro models into public/");

if (isWin || !platformSubdir) {
  run("node scripts/download-ffmpeg-win.mjs", "Ensuring Windows ffmpeg.exe is available");
  run("node scripts/download-swc-win.mjs", "Ensuring Windows SWC binary is available");
}

// Delete stale .next output before building to prevent Turbopack-cached
// artifacts from being reused. Turbopack (default in Next.js 16) generates
// hashed external module IDs (e.g. "kokoro-js-da441187d3cae0ac") that break
// runtime require() resolution in packaged Electron apps. We force webpack
// which produces stable, real module names.
const nextOutputDir = path.join(ROOT_DIR, ".next");
if (fs.existsSync(nextOutputDir)) {
  try {
    fs.rmSync(nextOutputDir, { recursive: true, force: true });
    console.log("\x1b[36m[Build] Removed stale .next output directory.\x1b[0m");
  } catch { /* non-fatal */ }
}

run("npx next build --webpack", "Building Next.js (webpack)");

const nextCacheDir = path.join(ROOT_DIR, ".next", "cache");
if (fs.existsSync(nextCacheDir)) {
  fs.rmSync(nextCacheDir, { recursive: true, force: true });
  console.log("\x1b[36m[Build] Removed .next/cache from production bundle staging.\x1b[0m");
}

// 5. Stamp and write release notes for this version
const releaseNotesArgs = [
  `--version=${targetVersion}`,
  platformSubdir ? `--platform=${platformSubdir}` : "",
].filter(Boolean).join(" ");
run(`node scripts/generate-release-file.mjs ${releaseNotesArgs}`, `Generating release notes (v${targetVersion})`);

// Tell electron-builder where to place artifacts for this platform
const outputConfig = `-c.directories.output=${targetDistDir}`;
run(
  `npx electron-builder --config electron-builder.yml ${outputConfig} ${forwardedArgs.join(" ")}`.trim(),
  `Packaging Electron app (${platformSubdir || "all"})`
);
