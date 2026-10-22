import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { secureDownloadFile } from "../../../../shared/secureDownload.mjs";
import { getVoicesDir, isVoiceDownloaded } from "@/lib/voiceStorage";
import { KOKORO_VOICES_CATALOG, voiceEngine } from "@/lib/voice-engine";

type DownloadProgress = {
  type: "status" | "progress" | "success" | "error";
  message?: string;
  file?: string;
  downloaded?: number;
  total?: number | null;
  remaining?: number | null;
  percent?: number | null;
  voice?: string;
  isInstalled?: boolean;
};

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const emit = async (event: DownloadProgress) => {
    try {
      await writer.write(encoder.encode(`${JSON.stringify(event)}\n`));
    } catch {}
  };

  void (async () => {
    try {
      const body = await req.json();
      const { voice } = body;

      if (!voice || typeof voice !== "string") {
        await emit({ type: "error", message: "Voice ID is required." });
        await writer.close();
        return;
      }

      const cleanVoice = voice.trim();
      const voiceDef = KOKORO_VOICES_CATALOG.find((v) => v.id === cleanVoice);
      if (!voiceDef) {
        await emit({ type: "error", message: `Unknown Kokoro voice ID: ${cleanVoice}` });
        await writer.close();
        return;
      }

      const voicesDir = getVoicesDir();
      fs.mkdirSync(voicesDir, { recursive: true });

      const destPath = path.join(voicesDir, `${cleanVoice}.bin`);
      const partPath = path.join(voicesDir, `${cleanVoice}.bin.part`);

      if (isVoiceDownloaded(cleanVoice)) {
        await emit({
          type: "success",
          voice: cleanVoice,
          message: `Voice "${voiceDef.name}" is already installed.`,
          isInstalled: true,
        });
        await writer.close();
        return;
      }

      await emit({
        type: "status",
        voice: cleanVoice,
        message: `Downloading neural voice profile for "${voiceDef.name}" (510 KB)...`,
      });

      const voiceUrl = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${cleanVoice}.bin`;

      await secureDownloadFile({
        url: voiceUrl,
        destPath,
        partPath,
        label: `${voiceDef.name} Voice`,
        onProgress: (ev) => {
          void emit({
            type: "progress",
            file: `${voiceDef.name} Voice (${ev.total ? Math.round(ev.total / 1024) : 510} KB)`,
            downloaded: ev.downloaded,
            total: ev.total ?? 522240,
            remaining: ev.total != null && ev.downloaded != null ? Math.max(ev.total - ev.downloaded, 0) : null,
            percent: ev.percent != null ? Math.round(ev.percent) : null,
            message: `Downloading ${voiceDef.name}...`,
          });
        },
      });

      // Clear engine cache so new voice is recognized immediately
      voiceEngine.invalidateCache();

      await emit({
        type: "success",
        voice: cleanVoice,
        message: `Voice "${voiceDef.name}" installed and ready for synthesis.`,
        isInstalled: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      await emit({
        type: "error",
        message: `Voice download error: ${msg}`,
      });
    } finally {
      try {
        await writer.close();
      } catch {}
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
