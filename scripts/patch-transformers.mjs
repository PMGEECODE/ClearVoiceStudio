/**
 * scripts/patch-transformers.mjs
 *
 * Patches:
 *  1. @xenova/transformers — guards isEmpty() so it doesn't throw when bundler
 *     mocks replace Node built-ins (fs, path) with undefined.
 *  2. kokoro-js/dist/kokoro.js and kokoro.cjs — rewrites the voice .bin file
 *     resolver so it searches multiple candidate paths in order:
 *       a) process.env.KOKORO_VOICES_DIR/<name>.bin
 *       b) <kokoro-js-package-root>/voices/<name>.bin
 *       c) <process.cwd()>/node_modules/kokoro-js/voices/<name>.bin
 *       d) <process.cwd()>/voices/<name>.bin
 *       e) Electron process.resourcesPath/app/node_modules/kokoro-js/voices/<name>.bin
 *     This fixes "Cannot read properties of undefined (reading 'output')" and
 *     "require is not defined" in packaged and bundled environments.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// ── 1. @xenova/transformers isEmpty() patch ────────────────────────────────

const TRANSFORMERS_DIR = path.join(ROOT_DIR, "node_modules", "@xenova", "transformers");

function patchFile(baseDir, relativePath, searchPattern, replacement) {
  const filePath = path.join(baseDir, relativePath);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  if (!searchPattern.test(content)) return;

  const patched = content.replace(searchPattern, replacement);
  fs.writeFileSync(filePath, patched, "utf8");
  console.log(`[Patch] Successfully patched ${relativePath}`);
}

if (fs.existsSync(TRANSFORMERS_DIR)) {
  patchFile(
    TRANSFORMERS_DIR,
    "src/env.js",
    /function isEmpty\(obj\) \{\s*return Object\.keys\(obj\)\.length === 0;\s*\}/,
    "function isEmpty(obj) {\n    return !obj || Object.keys(obj).length === 0;\n}"
  );

  patchFile(
    TRANSFORMERS_DIR,
    "dist/transformers.js",
    /function isEmpty\(obj\) \{\s*return Object\.keys\(obj\)\.length === 0;\s*\}/,
    "function isEmpty(obj) {\n    return !obj || Object.keys(obj).length === 0;\n}"
  );

  patchFile(
    TRANSFORMERS_DIR,
    "dist/transformers.min.js",
    /function b\(e\)\{return 0===Object\.keys\(e\)\.length\}/,
    "function b(e){return!e||0===Object.keys(e).length}"
  );
} else {
  console.log("[Patch] @xenova/transformers not found in node_modules, skipping.");
}

// ── 2. kokoro-js voice resolver patch ─────────────────────────────────────

const KOKORO_DIR = path.join(ROOT_DIR, "node_modules", "kokoro-js");

function patchKokoroJs(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[Patch] kokoro.js not found, skipping: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, "utf8");

  if (content.includes("resolveVoiceBin") && content.includes("_fup") && !content.includes("require(")) {
    console.log("[Patch] kokoro.js is already patched with clean ESM resolver.");
    return;
  }

  const URL_IMPORT = "import{fileURLToPath as _fup}from\"url\";";
  if (!content.includes(URL_IMPORT)) {
    content = URL_IMPORT + content;
  }

  const ESM_REPLACEMENT = "if(i&&Object.hasOwn(i,\"readFile\")){return await (async function resolveVoiceBin(voiceName){const thisDir=typeof _fup===\"function\"?s.dirname(_fup(import.meta.url)):(typeof import.meta!==\"undefined\"&&import.meta.dirname?import.meta.dirname:(\"undefined\"!==typeof __dirname?__dirname:\"\"));const candidates=[process.env.KOKORO_VOICES_DIR?s.join(process.env.KOKORO_VOICES_DIR,voiceName+\".bin\"):null,thisDir?s.resolve(thisDir,\"../voices/\"+voiceName+\".bin\"):null,s.join(process.cwd(),\"node_modules\",\"kokoro-js\",\"voices\",voiceName+\".bin\"),s.join(process.cwd(),\"voices\",voiceName+\".bin\"),typeof process!==\"undefined\"&&process.resourcesPath?s.join(process.resourcesPath,\"app\",\"node_modules\",\"kokoro-js\",\"voices\",voiceName+\".bin\"):null,typeof process!==\"undefined\"&&process.resourcesPath?s.join(process.resourcesPath,\"node_modules\",\"kokoro-js\",\"voices\",voiceName+\".bin\"):null,s.join(process.cwd(),\"resources\",\"app\",\"node_modules\",\"kokoro-js\",\"voices\",voiceName+\".bin\")].filter(Boolean);for(const candidate of candidates){try{const{buffer:r}=await i.readFile(candidate);return r}catch(_){}}throw new Error(\"Could not find voice file for '\"+voiceName+\"'. Searched: \"+candidates.join(\", \"))})(e)}";

  const EXISTING_RESOLVER = /if\(i&&Object\.hasOwn\(i,\"readFile\"\)\)\{return await \(async function resolveVoiceBin\(voiceName\)\{.*?\}\)\(e\)\}/;
  const PRISTINE_PATTERN = /if\(i&&Object\.hasOwn\(i,\"readFile\"\)\)\{const a=\"undefined\"!==?typeof __dirname\?__dirname:import\.meta\.dirname,t=s\.resolve\(a,`\.\.\/voices\/\$\{e\}\.bin`\),\{buffer:r\}=await i\.readFile\(t\);return r\}/;

  let patched = content;
  if (EXISTING_RESOLVER.test(patched)) {
    patched = patched.replace(EXISTING_RESOLVER, ESM_REPLACEMENT);
  } else if (PRISTINE_PATTERN.test(patched)) {
    patched = patched.replace(PRISTINE_PATTERN, ESM_REPLACEMENT);
  } else {
    console.warn("[Patch] Could not match voice resolver pattern in kokoro.js.");
    return;
  }

  fs.writeFileSync(filePath, patched, "utf8");
  console.log("[Patch] Successfully patched kokoro.js (ESM voice resolver).");
}

function patchKokoroCjs(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[Patch] kokoro.cjs not found, skipping: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, "utf8");

  if (content.includes("resolveVoiceBin") && !content.includes("require.resolve(")) {
    console.log("[Patch] kokoro.cjs is already patched with clean CJS resolver.");
    return;
  }

  const CJS_REPLACEMENT = "if(r&&Object.hasOwn(r,\"readFile\")){return await (async function resolveVoiceBin(voiceName){const thisDir=\"undefined\"!==typeof __dirname?__dirname:process.cwd();const candidates=[process.env.KOKORO_VOICES_DIR?t.join(process.env.KOKORO_VOICES_DIR,voiceName+\".bin\"):null,thisDir?t.resolve(thisDir,\"../voices/\"+voiceName+\".bin\"):null,t.join(process.cwd(),\"node_modules\",\"kokoro-js\",\"voices\",voiceName+\".bin\"),t.join(process.cwd(),\"voices\",voiceName+\".bin\"),typeof process!==\"undefined\"&&process.resourcesPath?t.join(process.resourcesPath,\"app\",\"node_modules\",\"kokoro-js\",\"voices\",voiceName+\".bin\"):null,typeof process!==\"undefined\"&&process.resourcesPath?t.join(process.resourcesPath,\"node_modules\",\"kokoro-js\",\"voices\",voiceName+\".bin\"):null,t.join(process.cwd(),\"resources\",\"app\",\"node_modules\",\"kokoro-js\",\"voices\",voiceName+\".bin\")].filter(Boolean);for(const candidate of candidates){try{const{buffer:l}=await r.readFile(candidate);return l}catch(_){}}throw new Error(\"Could not find voice file for '\"+voiceName+\"'. Searched: \"+candidates.join(\", \"))})(e)}";

  const EXISTING_RESOLVER = /if\(r&&Object\.hasOwn\(r,\"readFile\"\)\)\{return await \(async function resolveVoiceBin\(voiceName\)\{.*?\}\)\(e\)\}/;
  const PRISTINE_PATTERN = /if\(r&&Object\.hasOwn\(r,\"readFile\"\)\)\{const a=\"undefined\"!==?typeof __dirname\?__dirname:void 0,n=t\.resolve\(a,`\.\.\/voices\/\$\{e\}\.bin`\),\{buffer:l\}=await r\.readFile\(n\);return l\}/;

  let patched = content;
  if (EXISTING_RESOLVER.test(patched)) {
    patched = patched.replace(EXISTING_RESOLVER, CJS_REPLACEMENT);
  } else if (PRISTINE_PATTERN.test(patched)) {
    patched = patched.replace(PRISTINE_PATTERN, CJS_REPLACEMENT);
  } else {
    console.warn("[Patch] Could not match voice resolver pattern in kokoro.cjs.");
    return;
  }

  fs.writeFileSync(filePath, patched, "utf8");
  console.log("[Patch] Successfully patched kokoro.cjs (CJS voice resolver).");
}

// ── 3. @huggingface/transformers sharp decoupling patch ─────────────────────
// In packaged Windows desktop distributions, native C++ sharp binaries for win32
// (@img/sharp-win32-x64) are not present when building on Linux. Transformers.js
// unconditionally imports "sharp" at the top of transformers.node.mjs and
// requires("sharp") in transformers.node.cjs solely for computer-vision RawImage.
// For text-to-speech (KokoroTTS), sharp is never used, yet importing "sharp"
// throws an unhandled exception that crashes KokoroTTS initialization.
// We patch transformers.node.mjs, transformers.node.cjs, and src/utils/image.js
// so that sharp is decoupled, and throw-on-top-level image processing is guarded.

const HF_TRANSFORMERS_DIR = path.join(ROOT_DIR, "node_modules", "@huggingface", "transformers");

function patchHfTransformers() {
  if (!fs.existsSync(HF_TRANSFORMERS_DIR)) {
    console.log("[Patch] @huggingface/transformers not found, skipping.");
    return;
  }

  // Patch dist/transformers.node.mjs
  const nodeMjsPath = path.join(HF_TRANSFORMERS_DIR, "dist", "transformers.node.mjs");
  if (fs.existsSync(nodeMjsPath)) {
    let content = fs.readFileSync(nodeMjsPath, "utf8");
    let changed = false;

    if (content.includes('import * as __WEBPACK_EXTERNAL_MODULE_sharp__ from "sharp";')) {
      content = content.replace(
        'import * as __WEBPACK_EXTERNAL_MODULE_sharp__ from "sharp";',
        'const __WEBPACK_EXTERNAL_MODULE_sharp__ = { default: null };'
      );
      changed = true;
    }

    if (content.includes("throw new Error('Unable to load image processing library.');")) {
      content = content.replace(
        "throw new Error('Unable to load image processing library.');",
        "loadImageFunction = async () => { throw new Error('Unable to load image processing library.'); };"
      );
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(nodeMjsPath, content, "utf8");
      console.log("[Patch] Successfully patched @huggingface/transformers dist/transformers.node.mjs (sharp decoupled).");
    } else {
      console.log("[Patch] dist/transformers.node.mjs already patched or pattern not found.");
    }
  }

  // Patch dist/transformers.node.cjs
  const nodeCjsPath = path.join(HF_TRANSFORMERS_DIR, "dist", "transformers.node.cjs");
  if (fs.existsSync(nodeCjsPath)) {
    let content = fs.readFileSync(nodeCjsPath, "utf8");
    let changed = false;

    if (content.includes('module.exports = require("sharp");')) {
      content = content.replace(
        'module.exports = require("sharp");',
        'module.exports = { default: null };'
      );
      changed = true;
    }

    if (content.includes("throw new Error('Unable to load image processing library.');")) {
      content = content.replace(
        "throw new Error('Unable to load image processing library.');",
        "loadImageFunction = async () => { throw new Error('Unable to load image processing library.'); };"
      );
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(nodeCjsPath, content, "utf8");
      console.log("[Patch] Successfully patched @huggingface/transformers dist/transformers.node.cjs (sharp decoupled).");
    } else {
      console.log("[Patch] dist/transformers.node.cjs already patched or pattern not found.");
    }
  }

  // Patch src/utils/image.js (if referenced directly)
  const imageJsPath = path.join(HF_TRANSFORMERS_DIR, "src", "utils", "image.js");
  if (fs.existsSync(imageJsPath)) {
    let content = fs.readFileSync(imageJsPath, "utf8");
    let changed = false;

    if (content.includes("import sharp from 'sharp';")) {
      content = content.replace(
        "import sharp from 'sharp';",
        "let sharp = null; try { sharp = (await import('sharp')).default; } catch (_) {}"
      );
      changed = true;
    }

    if (content.includes("throw new Error('Unable to load image processing library.');")) {
      content = content.replace(
        "throw new Error('Unable to load image processing library.');",
        "loadImageFunction = async () => { throw new Error('Unable to load image processing library.'); };"
      );
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(imageJsPath, content, "utf8");
      console.log("[Patch] Successfully patched @huggingface/transformers src/utils/image.js (sharp decoupled).");
    }
  }
}

patchHfTransformers();

console.log("[Patch] All patches applied.");

