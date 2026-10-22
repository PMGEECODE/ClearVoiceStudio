/**
 * scripts/generate-release-file.mjs
 *
 * Stamps release_notes_template.md with the current build version and date,
 * then writes the output to:
 *   - dist-electron/<platform>/RELEASE_NOTES.md  (alongside the installer)
 *   - release_notes_v<VERSION>.md                (in the project root, for git/GitHub)
 *
 * Called automatically by electron-build.mjs after versioning is resolved.
 *
 * Usage (standalone):
 *   node scripts/generate-release-file.mjs --version=0.1.15 [--platform=linux|win|mac]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split("=");
      return [k, rest.join("=") || true];
    })
);

// Version: prefer --version arg, fall back to package.json
function resolveVersion() {
  if (args.version && typeof args.version === "string") return args.version;
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  return pkg.version || "0.0.0";
}

const version = resolveVersion();
const platform = (typeof args.platform === "string" ? args.platform : "").toLowerCase() || null;

// ── Template stamping ─────────────────────────────────────────────────────────

const templatePath = path.join(ROOT_DIR, "release_notes_template.md");
if (!fs.existsSync(templatePath)) {
  console.error("[release] ✗ release_notes_template.md not found — skipping.");
  process.exit(0);
}

const now = new Date();
const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

const stamped = fs.readFileSync(templatePath, "utf8")
  .replaceAll("{{VERSION}}", version)
  .replaceAll("{{DATE}}", dateStr);

// ── Write dist artifact copy (next to the installer) ─────────────────────────

const DIST_ROOT = path.join(ROOT_DIR, "dist-electron");

const outputDirs = platform
  ? [path.join(DIST_ROOT, platform)]
  : [
      path.join(DIST_ROOT, "linux"),
      path.join(DIST_ROOT, "win"),
      path.join(DIST_ROOT, "mac"),
    ].filter((d) => fs.existsSync(d));

for (const dir of outputDirs) {
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, "RELEASE_NOTES.md");
  fs.writeFileSync(outPath, stamped, "utf8");
  console.log(`\x1b[32m[release] ✓ Written → ${path.relative(ROOT_DIR, outPath)}\x1b[0m`);
}

// ── Write root copy (git-trackable, easy to paste into GitHub) ───────────────

const rootCopyPath = path.join(ROOT_DIR, `release_notes_v${version}.md`);
fs.writeFileSync(rootCopyPath, stamped, "utf8");
console.log(`\x1b[32m[release] ✓ Written → ${path.relative(ROOT_DIR, rootCopyPath)}\x1b[0m`);

// ── Clean up stale root-level release note files from older versions ──────────

try {
  const entries = fs.readdirSync(ROOT_DIR);
  for (const entry of entries) {
    const match = entry.match(/^release_notes_v(\d+\.\d+\.\d+)\.md$/);
    if (match && match[1] !== version) {
      fs.rmSync(path.join(ROOT_DIR, entry), { force: true });
      console.log(`\x1b[33m[release] Removed stale file: ${entry}\x1b[0m`);
    }
  }
} catch {
  // Non-fatal: stale cleanup is best-effort
}

console.log(`\x1b[35m[release] Release notes stamped for v${version}\x1b[0m`);
