/**
 * Resumable HTTPS downloads with optional SHA-256 verification and atomic install.
 * Used by Electron first-run bootstrap and Next.js /api/download-voice.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import { URL } from "url";
import { isLikelyNetworkError } from "./networkReachability.mjs";

const DEFAULT_MAX_REDIRECTS = 6;

/** Runtime voice/download paths — opt out of Turbopack static filesystem tracing. */
function pathExists(filePath) {
  return fs.existsSync(/* turbopackIgnore: true */ filePath);
}

function pathStatSize(filePath) {
  return fs.statSync(/* turbopackIgnore: true */ filePath).size;
}

function unlinkPath(filePath) {
  fs.unlinkSync(/* turbopackIgnore: true */ filePath);
}

function renamePath(fromPath, toPath) {
  fs.renameSync(/* turbopackIgnore: true */ fromPath, /* turbopackIgnore: true */ toPath);
}

/**
 * @param {unknown} err
 */
export function normalizeDownloadError(err) {
  if (err instanceof Error && isLikelyNetworkError(err)) {
    const wrapped = new Error("Network connection lost during download");
    wrapped.code = err.code || "ERR_NETWORK";
    wrapped.cause = err;
    return wrapped;
  }
  return err;
}

function assertHttpsUrl(urlString) {
  const parsed = new URL(urlString);
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS download URLs are allowed");
  }
  return parsed;
}

function httpsRequest(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    assertHttpsUrl(urlString);
    const req = https.request(urlString, options, (res) => {
      resolve(res);
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * @param {string} url
 * @returns {Promise<{ total: number | null, acceptsRanges: boolean }>}
 */
export async function headDownloadMeta(url, maxRedirects = DEFAULT_MAX_REDIRECTS) {
  const follow = async (currentUrl, left) => {
    if (left <= 0) throw new Error("Too many redirects during HEAD");
    const res = await httpsRequest(currentUrl, { method: "HEAD" });
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      const next = new URL(res.headers.location, currentUrl).toString();
      res.resume();
      return follow(next, left - 1);
    }
    const totalRaw = res.headers["content-length"];
    const total = totalRaw ? Number.parseInt(String(totalRaw), 10) : null;
    const knownTotal = Number.isFinite(total) && total > 0 ? total : null;
    const acceptsRanges = String(res.headers["accept-ranges"] || "").toLowerCase() === "bytes";
    res.resume();
    return { total: knownTotal, acceptsRanges };
  };
  return follow(url, maxRedirects);
}

/**
 * @param {string} filePath
 * @param {string | null | undefined} expectedSha256
 */
export async function verifyFileSha256(filePath, expectedSha256) {
  if (!expectedSha256 || typeof expectedSha256 !== "string") {
    return true;
  }
  const expected = expectedSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error("Invalid expected SHA-256 in manifest");
  }
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const actual = hash.digest("hex");
  if (actual !== expected) {
    throw new Error("Download verification failed (checksum mismatch)");
  }
  return true;
}

/**
 * @typedef {Object} SecureDownloadProgress
 * @property {number} [downloaded]
 * @property {number | null} [total]
 * @property {number | null} [percent]
 * @property {string} [message]
 * @property {string} [file]
 */

/**
 * @typedef {Object} SecureDownloadOptions
 * @property {string} url
 * @property {string} destPath
 * @property {string} [partPath]
 * @property {string | null} [expectedSha256]
 * @property {number | null} [expectedSize]
 * @property {string} [label]
 * @property {number} [maxRedirects]
 * @property {(event: SecureDownloadProgress) => void | Promise<void>} [onProgress]
 * @property {boolean} [resume]
 */

/**
 * @param {SecureDownloadOptions} options
 */
export async function secureDownloadFile(options) {
  const {
    url,
    destPath,
    partPath: partPathOpt,
    expectedSha256 = null,
    expectedSize = null,
    label = "file",
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    onProgress,
    resume = true,
  } = options;

  assertHttpsUrl(url);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  const partPath = partPathOpt || `${destPath}.part`;
  fs.mkdirSync(path.dirname(partPath), { recursive: true });

  if (pathExists(destPath)) {
    try {
      await verifyFileSha256(destPath, expectedSha256);
      if (expectedSize != null && pathStatSize(destPath) !== expectedSize) {
        throw new Error("size mismatch");
      }
      await onProgress?.({
        downloaded: pathStatSize(destPath),
        total: expectedSize ?? pathStatSize(destPath),
        percent: 100,
        message: `${label} already installed`,
        file: label,
      });
      return { skipped: true, destPath };
    } catch {
      try {
        unlinkPath(destPath);
      } catch {}
    }
  }

  let startByte = 0;
  if (resume && pathExists(partPath)) {
    startByte = pathStatSize(partPath);
  } else if (pathExists(partPath)) {
    try {
      unlinkPath(partPath);
    } catch {}
    startByte = 0;
  }

  let meta;
  try {
    meta = await headDownloadMeta(url, maxRedirects);
  } catch (err) {
    throw normalizeDownloadError(err);
  }
  const total = expectedSize ?? meta.total;

  if (total != null && startByte > total) {
    try {
      unlinkPath(partPath);
    } catch {}
    startByte = 0;
  }

  if (total != null && startByte === total) {
    renamePath(partPath, destPath);
    await verifyFileSha256(destPath, expectedSha256);
    await onProgress?.({ downloaded: total, total, percent: 100, message: `Downloaded ${label}`, file: label });
    return { skipped: false, destPath };
  }

  try {
    await downloadWithOptionalRange({
      url,
      partPath,
      startByte,
      total,
      label,
      maxRedirects,
      onProgress,
      canResume: resume && meta.acceptsRanges,
    });
  } catch (err) {
    throw normalizeDownloadError(err);
  }

  if (expectedSize != null) {
    const size = pathStatSize(partPath);
    if (size !== expectedSize) {
      try {
        unlinkPath(partPath);
      } catch {}
      throw new Error(`Download size mismatch for ${label}`);
    }
  }

  await verifyFileSha256(partPath, expectedSha256);

  if (pathExists(destPath)) {
    try {
      unlinkPath(destPath);
    } catch {}
  }
  renamePath(partPath, destPath);

  const finalSize = pathStatSize(destPath);
  await onProgress?.({
    downloaded: finalSize,
    total: total ?? finalSize,
    percent: 100,
    message: `Downloaded ${label}`,
    file: label,
  });

  return { skipped: false, destPath };
}

/**
 * @param {Object} params
 */
function downloadWithOptionalRange(params) {
  const { url, partPath, startByte, total, label, maxRedirects, onProgress, canResume } = params;

  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectsLeft, rangeStart) => {
      if (redirectsLeft <= 0) {
        return reject(new Error("Too many redirects during download"));
      }

      const headers = {};
      if (rangeStart > 0 && canResume) {
        headers.Range = `bytes=${rangeStart}-`;
      }

      const req = https.get(currentUrl, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, currentUrl).toString();
          res.resume();
          return follow(nextUrl, redirectsLeft - 1, rangeStart);
        }

        const isPartial = res.statusCode === 206;
        const isOk = res.statusCode === 200;
        if (!isPartial && !isOk) {
          res.resume();
          return reject(new Error(`Download returned HTTP ${res.statusCode}`));
        }

        if (rangeStart > 0 && res.statusCode === 200) {
          try {
            unlinkPath(partPath);
          } catch {}
          rangeStart = 0;
        }

        const contentLength = Number.parseInt(String(res.headers["content-length"] || ""), 10);
        const chunkTotal =
          total ??
          (Number.isFinite(contentLength) && contentLength > 0
            ? rangeStart + contentLength
            : null);

        let downloaded = rangeStart;
        const outFlags = rangeStart > 0 && isPartial ? "a" : "w";
        const outStream = fs.createWriteStream(partPath, { flags: outFlags });

        void onProgress?.({
          downloaded,
          total: chunkTotal,
          percent: chunkTotal ? Math.min(99, Math.round((downloaded / chunkTotal) * 100)) : null,
          message: `Downloading ${label}`,
          file: label,
        });

        res.on("data", (chunk) => {
          downloaded += chunk.length;
          void onProgress?.({
            downloaded,
            total: chunkTotal,
            percent: chunkTotal ? Math.min(99, Math.round((downloaded / chunkTotal) * 100)) : null,
            message: `Downloading ${label}`,
            file: label,
          });
        });

        res.pipe(outStream);

        outStream.on("finish", () => {
          outStream.close((err) => {
            if (err) return reject(err);
            resolve();
          });
        });

        outStream.on("error", (err) => {
          reject(normalizeDownloadError(err));
        });

        res.on("error", (err) => {
          reject(normalizeDownloadError(err));
        });
      });

      req.on("error", (err) => {
        reject(normalizeDownloadError(err));
      });
    };

    follow(url, maxRedirects, startByte);
  });
}
