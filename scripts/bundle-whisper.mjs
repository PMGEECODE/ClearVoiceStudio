/**
 * scripts/bundle-whisper.mjs
 *
 * Bundles the Whisper speech-to-text model, ONNX WASM runtimes, and Kokoro TTS models
 * directly into `public/` so the desktop app (Electron) operates completely
 * offline on first launch without requiring CDN or HuggingFace downloads.
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const WHISPER_MODEL_DIR = path.join(PUBLIC_DIR, "models", "Xenova", "whisper-tiny.en");
const WASM_DEST_DIR = path.join(PUBLIC_DIR, "wasm");
const KOKORO_CACHE_SRC = path.join(
  ROOT_DIR,
  "node_modules",
  "@huggingface",
  "transformers",
  ".cache",
  "onnx-community",
  "Kokoro-82M-v1.0-ONNX"
);
const KOKORO_DEST_DIR = path.join(PUBLIC_DIR, "models", "onnx-community", "Kokoro-82M-v1.0-ONNX");

// Files required by @xenova/transformers automatic-speech-recognition for whisper-tiny.en
const WHISPER_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.json",
  "merges.txt",
  "normalizer.json",
  "added_tokens.json",
  "special_tokens_map.json",
  "quant_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];

const HF_BASE_URL = "https://huggingface.co/Xenova/whisper-tiny.en/resolve/main/";

/**
 * Downloads a file from a URL, handling HTTP redirects (301, 302, 307, 308).
 */
function downloadFile(url, destPath, retries = 3) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const client = url.startsWith("https") ? https : http;

    const req = client.get(url, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith("http")) {
          const origin = new URL(url).origin;
          redirectUrl = origin + redirectUrl;
        }
        res.resume();
        return downloadFile(redirectUrl, destPath, retries)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        if (retries > 0) {
          console.warn(`[Bundle] HTTP ${res.statusCode} for ${url}, retrying (${retries} left)...`);
          return setTimeout(() => {
            downloadFile(url, destPath, retries - 1).then(resolve).catch(reject);
          }, 1000);
        }
        return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
      }

      const tempPath = `${destPath}.tmp_${Date.now()}`;
      const fileStream = fs.createWriteStream(tempPath);

      res.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close(() => {
          fs.renameSync(tempPath, destPath);
          resolve();
        });
      });

      fileStream.on("error", (err) => {
        try { fs.unlinkSync(tempPath); } catch {}
        reject(err);
      });
    });

    req.on("error", (err) => {
      if (retries > 0) {
        console.warn(`[Bundle] Network error: ${err.message}, retrying (${retries} left)...`);
        return setTimeout(() => {
          downloadFile(url, destPath, retries - 1).then(resolve).catch(reject);
        }, 1000);
      }
      reject(err);
    });

    req.setTimeout(60000, () => {
      req.destroy(new Error(`Timeout downloading ${url}`));
    });
  });
}

/**
 * Copies WASM files from @xenova/transformers / onnxruntime-web into public/wasm/.
 */
function copyWasmAssets() {
  console.log("\x1b[36m[Bundle] Staging ONNX WASM runtime files to public/wasm…\x1b[0m");
  fs.mkdirSync(WASM_DEST_DIR, { recursive: true });

  const sourceDirs = [
    path.join(ROOT_DIR, "node_modules", "@xenova", "transformers", "dist"),
    path.join(ROOT_DIR, "node_modules", "onnxruntime-web", "dist"),
  ];

  let copied = 0;
  for (const srcDir of sourceDirs) {
    if (!fs.existsSync(srcDir)) continue;
    for (const f of fs.readdirSync(srcDir)) {
      if (f.endsWith(".wasm") || f.endsWith(".worker.js")) {
        const srcFile = path.join(srcDir, f);
        const destFile = path.join(WASM_DEST_DIR, f);
        if (!fs.existsSync(destFile) || fs.statSync(destFile).size !== fs.statSync(srcFile).size) {
          fs.copyFileSync(srcFile, destFile);
          console.log(`[Bundle] Copied WASM asset: ${f}`);
          copied++;
        }
      }
    }
  }
  console.log(`\x1b[32m[Bundle] ✓ ONNX WASM runtime assets ready (${copied} updated).\x1b[0m`);
}

/**
 * Copies pre-cached Kokoro model from node_modules cache to public/models/
 * so it is included in production packaging without being excluded by .cache filters.
 */
function copyKokoroAssets() {
  console.log("\x1b[36m[Bundle] Staging Kokoro model assets to public/models…\x1b[0m");
  if (!fs.existsSync(KOKORO_CACHE_SRC)) {
    console.log("[Bundle] Kokoro cache not found in node_modules, skipping copy.");
    return;
  }

  function copyRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        if (!fs.existsSync(destPath) || fs.statSync(destPath).size !== fs.statSync(srcPath).size) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }

  copyRecursive(KOKORO_CACHE_SRC, KOKORO_DEST_DIR);
  console.log("\x1b[32m[Bundle] ✓ Kokoro model assets staged to public/models.\x1b[0m");
}

/**
 * Downloads Whisper model files if not already present.
 */
async function bundleWhisperModel() {
  console.log("\x1b[36m[Bundle] Ensuring Xenova/whisper-tiny.en model files in public/models…\x1b[0m");
  fs.mkdirSync(WHISPER_MODEL_DIR, { recursive: true });

  for (const relFile of WHISPER_FILES) {
    const destPath = path.join(WHISPER_MODEL_DIR, relFile);
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
      // File already present
      continue;
    }

    const downloadUrl = `${HF_BASE_URL}${relFile}`;
    console.log(`[Bundle] Downloading ${relFile}…`);
    await downloadFile(downloadUrl, destPath);
    const sizeMb = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(2);
    console.log(`[Bundle] ✓ Downloaded ${relFile} (${sizeMb} MB)`);
  }

  console.log("\x1b[32m[Bundle] ✓ Xenova/whisper-tiny.en model files ready.\x1b[0m");
}

async function main() {
  try {
    copyWasmAssets();
    copyKokoroAssets();
    await bundleWhisperModel();
    console.log("\x1b[32m\x1b[1m[Bundle] All offline models and runtime assets successfully staged in public/.\x1b[0m");
  } catch (err) {
    console.error("\x1b[31m[Bundle] Error during offline assets bundling:\x1b[0m", err);
    process.exit(1);
  }
}

main();
