#!/usr/bin/env node
/**
 * Verifies GitHub Release assets required for electron-updater.
 *
 * Usage:
 *   node scripts/verify-release-assets.mjs v0.1.15 --platform win
 *   node scripts/verify-release-assets.mjs v0.1.15 --platform linux
 */

import https from "https";

const owner = process.env.GITHUB_OWNER || "PMGEECODE";
const repo = process.env.GITHUB_REPO || "ClearVoiceStudio";

const args = process.argv.slice(2);
const tag = args.find((a) => !a.startsWith("--")) || process.env.RELEASE_TAG;
const platformArg = args.find((a) => a.startsWith("--platform="))?.split("=")[1]
  || (args.includes("--platform") ? args[args.indexOf("--platform") + 1] : null)
  || process.env.RELEASE_PLATFORM;

if (!tag) {
  console.error("Usage: node scripts/verify-release-assets.mjs <tag> [--platform win|linux]");
  process.exit(1);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "ClearVoice-Studio-Release-Verify",
            Accept: "application/vnd.github+json",
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(body));
              return;
            }
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          });
        }
      )
      .on("error", reject);
  });
}

const requiredByPlatform = {
  win: ["latest.yml"],
  linux: ["latest-linux.yml"],
};

const required =
  platformArg && requiredByPlatform[platformArg]
    ? requiredByPlatform[platformArg]
    : ["latest.yml", "latest-linux.yml"];

const data = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`);
const names = new Set((data.assets || []).map((a) => a.name));

const missing = required.filter((name) => !names.has(name));

console.log(`Release: ${data.html_url}`);
console.log(`Checking: ${required.join(", ")}`);
console.log(`Assets: ${[...names].join(", ") || "(none)"}`);

if (missing.length > 0) {
  console.error("\nMissing auto-update metadata:");
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error(
    "\nFix: publish with CI (electron-builder --config electron-builder.yml --publish always)."
  );
  process.exit(1);
}

console.log("\nRequired auto-update metadata present.");
process.exit(0);
