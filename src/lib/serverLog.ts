import fs from "fs";
import os from "os";
import path from "path";

type LogLevel = "info" | "warn" | "error";
const LOG_FILE_NAMES = ["clearvoicestodio.log", "clearvoicestudio.log"];

export function getClearVoiceLogPath(): string {
  if (process.env.CLEARVOICE_LOG_FILE) {
    return process.env.CLEARVOICE_LOG_FILE;
  }

  const baseDir =
    process.platform === "win32"
      ? process.env.LOCALAPPDATA || process.env.APPDATA || os.tmpdir()
      : process.env.XDG_STATE_HOME ||
        (process.env.HOME ? path.join(process.env.HOME, ".local", "state") : os.tmpdir());

  return path.join(baseDir, "ClearVoice Studio", "logs", "clearvoicestodio.log");
}

export function logServerEvent(
  scope: string,
  message: string,
  details?: Record<string, unknown>,
  level: LogLevel = "info"
): void {
  try {
    const logPaths = getClearVoiceLogPaths();
    const detailText = details ? ` ${JSON.stringify(redactDetails(details))}` : "";
    const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${message}${detailText}\n`;
    for (const logPath of logPaths) {
      try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, line, "utf-8");
      } catch {}
    }
  } catch {
    // Logging must never break synthesis or startup.
  }
}

function getClearVoiceLogPaths(): string[] {
  const primaryPath = getClearVoiceLogPath();
  const paths = new Set<string>([primaryPath]);
  const dir = path.dirname(primaryPath);

  for (const name of LOG_FILE_NAMES) {
    paths.add(path.join(/* turbopackIgnore: true */ dir, name));
  }

  paths.add(path.join(/* turbopackIgnore: true */ os.tmpdir(), "ClearVoice Studio", "logs", LOG_FILE_NAMES[0]));
  paths.add(path.join(/* turbopackIgnore: true */ os.tmpdir(), "ClearVoice Studio", "logs", LOG_FILE_NAMES[1]));

  return Array.from(paths);
}

function redactDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (/text|script|content|password|token|secret/i.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, value];
    })
  );
}
