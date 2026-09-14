/**
 * scripts/electron-build.mjs
 *
 * Production build script:
 *  1. Build the Next.js app (next build).
 *  2. Package the Electron app with electron-builder.
 *
 * Run: node scripts/electron-build.mjs
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

function run(cmd, label) {
  console.log(`\x1b[36m[Build] ${label}…\x1b[0m`);
  execSync(cmd, { cwd: ROOT_DIR, stdio: "inherit" });
  console.log(`\x1b[32m[Build] ✓ ${label} complete.\x1b[0m`);
}

// Remove previous binary packages to prevent ETXTBSY file locks
try {
  const distDir = path.join(ROOT_DIR, "dist-electron");
  if (fs.existsSync(distDir)) {
    for (const file of fs.readdirSync(distDir)) {
      if (file.endsWith(".AppImage") || file.endsWith(".deb") || file.endsWith(".exe")) {
        fs.rmSync(path.join(distDir, file), { force: true });
      }
    }
  }
} catch {}

const extraArgs = process.argv.slice(2).join(" ");
run("node scripts/patch-transformers.mjs", "Applying bundler compatibility patches");
run("npx next build", "Building Next.js");
run(`npx electron-builder --config electron-builder.yml ${extraArgs}`.trim(), "Packaging Electron app");
