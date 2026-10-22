/**
 * Internet reachability checks for first-run bootstrap (HTTPS probe, not just link-local).
 */

import https from "https";
import { URL } from "url";

const DEFAULT_PROBE_URL = "https://github.com/";

const NETWORK_ERROR_CODES = new Set([
  "ENOTFOUND",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ECONNABORTED",
  "ERR_NETWORK",
]);

/**
 * @param {unknown} err
 */
export function isLikelyNetworkError(err) {
  if (!err || typeof err !== "object") return false;
  const code = /** @type {{ code?: string }} */ (err).code;
  if (code && NETWORK_ERROR_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /network|internet|offline|timed out|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(
    message
  );
}

/**
 * @param {string} [probeUrl]
 * @param {number} [timeoutMs]
 */
export function probeInternetReachable(probeUrl = DEFAULT_PROBE_URL, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const parsed = new URL(probeUrl);
      if (parsed.protocol !== "https:") {
        finish(false);
        return;
      }

      const req = https.request(
        probeUrl,
        { method: "HEAD", timeout: timeoutMs },
        (res) => {
          res.resume();
          finish(Boolean(res.statusCode && res.statusCode < 500));
        }
      );

      req.on("timeout", () => {
        req.destroy();
        finish(false);
      });

      req.on("error", () => finish(false));
      req.end();
    } catch {
      finish(false);
    }
  });
}

/**
 * @param {number} ms
 * @param {() => boolean} shouldContinue
 */
export function sleepWhile(ms, shouldContinue) {
  return new Promise((resolve) => {
    if (!shouldContinue()) {
      resolve(false);
      return;
    }
    const started = Date.now();
    const tick = () => {
      if (!shouldContinue()) {
        resolve(false);
        return;
      }
      if (Date.now() - started >= ms) {
        resolve(true);
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}
