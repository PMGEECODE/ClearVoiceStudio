import { NextResponse } from "next/server";
import { DEFAULT_VOICE_ID, getVoicesDir } from "@/lib/voiceStorage";
import { voiceEngine } from "@/lib/voice-engine";

export async function GET() {
  const startTime = Date.now();
  const voices = await voiceEngine.listAllVoices().catch(() => []);
  const installedCount = voices.filter((v) => v.isInstalled).length;

  return NextResponse.json({
    status: "online",
    latencyMs: Date.now() - startTime,
    engine: "kokoro",
    defaultVoice: DEFAULT_VOICE_ID,
    voicesDir: getVoicesDir(),
    voicesInstalled: installedCount,
    totalVoicesAvailable: voices.length,
    model: "Kokoro-82M-v1.0-ONNX (q8)",
  });
}
