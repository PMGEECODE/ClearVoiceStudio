/**
 * scripts/patch-transformers.mjs
 *
 * Patches @xenova/transformers to safely handle undefined/null bundler mocks for Node built-ins (fs, path).
 * Modern bundlers like Turbopack/Webpack in browser mode replace `import fs from 'fs'` with `undefined`,
 * causing `Object.keys(fs)` in transformers' `isEmpty()` to throw:
 * "TypeError: Cannot convert undefined or null to object".
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const TRANSFORMERS_DIR = path.join(ROOT_DIR, "node_modules", "@xenova", "transformers");

function patchFile(relativePath, searchPattern, replacement) {
  const filePath = path.join(TRANSFORMERS_DIR, relativePath);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  if (content.includes(replacement)) {
    console.log(`[Patch] ${relativePath} already patched.`);
    return;
  }

  if (!searchPattern.test(content)) {
    console.warn(`[Patch] Pattern not found in ${relativePath}`);
    return;
  }

  const updated = content.replace(searchPattern, replacement);
  fs.writeFileSync(filePath, updated, "utf8");
  console.log(`[Patch] Successfully patched ${relativePath}`);
}

if (fs.existsSync(TRANSFORMERS_DIR)) {
  // 1. src/env.js
  patchFile(
    "src/env.js",
    /function isEmpty\(obj\) \{\s*return Object\.keys\(obj\)\.length === 0;\s*\}/,
    "function isEmpty(obj) {\n    return !obj || Object.keys(obj).length === 0;\n}"
  );

  // 2. dist/transformers.js
  patchFile(
    "dist/transformers.js",
    /function isEmpty\(obj\) \{\s*return Object\.keys\(obj\)\.length === 0;\s*\}/,
    "function isEmpty(obj) {\n    return !obj || Object.keys(obj).length === 0;\n}"
  );

  // 3. dist/transformers.min.js
  patchFile(
    "dist/transformers.min.js",
    /function b\(e\)\{return 0===Object\.keys\(e\)\.length\}/,
    "function b(e){return!e||0===Object.keys(e).length}"
  );
} else {
  console.log("[Patch] @xenova/transformers not found in node_modules, skipping.");
}
