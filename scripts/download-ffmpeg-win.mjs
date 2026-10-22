#!/usr/bin/env node
/**
 * scripts/download-ffmpeg-win.mjs
 *
 * Downloads the official static FFmpeg Windows x64 binary from eugeneware/ffmpeg-static releases
 * and places ffmpeg.exe into:
 *   - build-resources/ffmpeg-win/ffmpeg.exe
 *   - build-resources/piper-win/ffmpeg.exe
 *   - node_modules/ffmpeg-static/ffmpeg.exe
 *
 * Ensures FFmpeg is available offline on Windows for MP3/MP4 audio & video conversions.
 */

import fs from "fs";
import path from "path";
import https from "https";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FFMPEG_WIN_URL = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64.gz";

const TARGET_DIRS = [
  path.join(ROOT, "build-resources", "ffmpeg-win"),
  path.join(ROOT, "node_modules", "ffmpeg-static"),
];

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location);
        } else if (res.statusCode === 200) {
          resolve(res);
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
      }).on("error", reject);
    };
    follow(url);
  });
}

async function main() {
  const primaryExe = path.join(ROOT, "build-resources", "ffmpeg-win", "ffmpeg.exe");
  const force = process.argv.includes("--force");

  if (!force && fs.existsSync(primaryExe) && fs.statSync(primaryExe).size > 10000000) {
    console.log(`\x1b[32m[FFmpeg Win] ffmpeg.exe already downloaded at ${primaryExe} (${(fs.statSync(primaryExe).size / (1024 * 1024)).toFixed(1)} MB)\x1b[0m`);
    // Ensure all target dirs have a copy
    for (const dir of TARGET_DIRS) {
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, "ffmpeg.exe");
      if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(primaryExe).size) {
        fs.copyFileSync(primaryExe, dest);
        console.log(`\x1b[32m[FFmpeg Win] Copied to ${dest}\x1b[0m`);
      }
    }
    return;
  }

  console.log("\x1b[36m[FFmpeg Win] Downloading Windows x64 ffmpeg.exe...\x1b[0m");
  fs.mkdirSync(path.join(ROOT, "build-resources", "ffmpeg-win"), { recursive: true });

  const res = await httpsGet(FFMPEG_WIN_URL);
  const total = parseInt(res.headers["content-length"] || "0", 10);
  let downloaded = 0;
  let lastPct = -1;

  res.on("data", (chunk) => {
    downloaded += chunk.length;
    if (total > 0) {
      const pct = Math.floor((downloaded / total) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        process.stdout.write(`\r[FFmpeg Win] Downloading... ${pct}%`);
        lastPct = pct;
      }
    }
  });

  const gunzip = zlib.createGunzip();
  const out = fs.createWriteStream(primaryExe);

  await new Promise((resolve, reject) => {
    res.pipe(gunzip).pipe(out);
    out.on("finish", () => {
      process.stdout.write("\r[FFmpeg Win] Download & extraction complete.       \n");
      resolve();
    });
    gunzip.on("error", reject);
    out.on("error", reject);
    res.on("error", reject);
  });

  const sizeMb = (fs.statSync(primaryExe).size / (1024 * 1024)).toFixed(1);
  console.log(`\x1b[32m[FFmpeg Win] ✓ Saved ffmpeg.exe (${sizeMb} MB) to ${primaryExe}\x1b[0m`);

  // Copy to secondary target directories
  for (const dir of TARGET_DIRS) {
    if (dir === path.join(ROOT, "build-resources", "ffmpeg-win")) continue;
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, "ffmpeg.exe");
    fs.copyFileSync(primaryExe, dest);
    console.log(`\x1b[32m[FFmpeg Win] Copied to ${dest}\x1b[0m`);
  }
}

main().catch((err) => {
  console.error(`\x1b[31m[FFmpeg Win] Error: ${err.message}\x1b[0m`);
  process.exit(1);
});
