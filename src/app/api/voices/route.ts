import { NextResponse } from "next/server";
import { voiceEngine, UnifiedVoiceInfo } from "@/lib/voice-engine";

export type { UnifiedVoiceInfo as VoiceModelInfo };

export async function GET() {
  try {
    const voices = await voiceEngine.listAllVoices();
    return NextResponse.json({
      voices,
      source: "unified_voice_engine",
      total: voices.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list voices";
    return NextResponse.json(
      {
        error: message,
        voices: [],
      },
      { status: 500 }
    );
  }
}
