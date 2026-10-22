import { spawn, type SpawnOptions } from "child_process";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function fileExists(candidate: string | null | undefined): candidate is string {
  if (!candidate) return false;
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function resolveBundledFfmpegPath(): string | null {
  try {
    const bundled = require("ffmpeg-static") as string | null | undefined;
    if (fileExists(bundled)) {
      return bundled;
    }
  } catch {
    // Optional dependency path — fall through to system lookup.
  }

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    process.env.FFMPEG_PATH,
    resourcesPath ? path.join(resourcesPath, "ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg") : null,
    process.execPath
      ? path.join(path.dirname(process.execPath), "resources", "ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")
      : null,
    path.resolve(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"),
  ];

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getFfmpegPath(): string {
  const bundled = resolveBundledFfmpegPath();
  if (bundled) {
    return bundled;
  }
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

export function isFfmpegAvailable(): boolean {
  return fileExists(getFfmpegPath()) || getFfmpegPath() === "ffmpeg" || getFfmpegPath() === "ffmpeg.exe";
}

export function runFfmpeg(args: string[], inputBuffer: Buffer, options: SpawnOptions = {}): Promise<Buffer> {
  const ffmpegPath = getFfmpegPath();

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(/* turbopackIgnore: true */ ffmpegPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      ...options,
    });

    const { stdout, stderr, stdin } = ffmpeg;
    if (!stdout || !stderr || !stdin) {
      reject(new Error("FFmpeg process streams are unavailable."));
      return;
    }

    const chunks: Buffer[] = [];
    let errLog = "";

    stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stderr.on("data", (data: Buffer) => {
      errLog += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
        return;
      }
      reject(new Error(`FFmpeg exited with code ${code}: ${errLog.slice(-400)}`));
    });

    ffmpeg.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "FFmpeg was not found. MP3 and MP4 export require FFmpeg — reinstall the app or install FFmpeg and add it to PATH."
          )
        );
        return;
      }
      reject(err);
    });

    stdin.write(inputBuffer);
    stdin.end();
  });
}
