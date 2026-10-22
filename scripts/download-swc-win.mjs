#!/usr/bin/env node
/**
 * scripts/download-swc-win.mjs
 *
 * Ensures the Windows x64 SWC native binary (@next/swc-win32-x64-msvc)
 * is present in node_modules/@next/swc-win32-x64-msvc.
 *
 * When building the Windows desktop app on Linux, npm skips win32 optionalDependencies.
 * Without this binary, Next.js attempts to download SWC at runtime via npm on the user's
 * machine, which fails on machines without npm/node installed and crashes Next.js startup.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const SWC_PKG = "@next/swc-win32-x64-msvc";
const SWC_DIR = path.join(ROOT_DIR, "node_modules", "@next", "swc-win32-x64-msvc");
const SWC_NODE_FILE = path.join(SWC_DIR, "next-swc.win32-x64-msvc.node");

function getNextVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
    const nextVer = pkg.dependencies?.next?.replace(/^[^0-9]*/, "");
    return nextVer || "16.3.4";
  } catch {
    return "16.3.4";
  }
}

async function main() {
  if (fs.existsSync(SWC_NODE_FILE) && fs.statSync(SWC_NODE_FILE).size > 10000000) {
    const sizeMb = (fs.statSync(SWC_NODE_FILE).size / (1024 * 1024)).toFixed(1);
    console.log(`\x1b[32m[SWC Win] Windows SWC binary already present (${sizeMb} MB) at ${SWC_NODE_FILE}\x1b[0m`);
    return;
  }

  const version = getNextVersion();
  console.log(`\x1b[36m[SWC Win] Downloading ${SWC_PKG}@${version} for Windows packaging…\x1b[0m`);

  const tmpDir = path.join(ROOT_DIR, "build-resources", "swc-win");
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`npm pack ${SWC_PKG}@${version}`, { cwd: tmpDir, stdio: "inherit" });
    const tarball = fs.readdirSync(tmpDir).find((f) => f.endsWith(".tgz"));
    if (!tarball) {
      throw new Error("Failed to download SWC tarball from npm");
    }

    fs.mkdirSync(SWC_DIR, { recursive: true });
    execSync(`tar -xzf "${path.join(tmpDir, tarball)}" -C "${SWC_DIR}" --strip-components=1`, {
      stdio: "inherit",
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (!fs.existsSync(SWC_NODE_FILE)) {
      throw new Error(`SWC extraction did not produce ${SWC_NODE_FILE}`);
    }

    const sizeMb = (fs.statSync(SWC_NODE_FILE).size / (1024 * 1024)).toFixed(1);
    console.log(`\x1b[32m[SWC Win] ✓ Successfully staged Windows SWC binary (${sizeMb} MB)\x1b[0m`);
  } catch (err) {
    console.error(`\x1b[31m[SWC Win] Error: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
