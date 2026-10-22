import { NextResponse } from "next/server";
import { KOKORO_VOICES_CATALOG } from "@/lib/voice-engine";
import { isVoiceDownloaded, DEFAULT_VOICE_ID } from "@/lib/voiceStorage";

export interface CatalogVoice {
  id: string;
  name: string;
  languageFamily: string;
  languageCode: string;
  languageName: string;
  countryName: string;
  quality: string;
  numSpeakers: number;
  sampleUrl: string;
  isInstalled: boolean;
  sizeBytes?: number;
}

export async function GET() {
  const voices: CatalogVoice[] = KOKORO_VOICES_CATALOG.map((def) => {
    const isDefault = def.id === DEFAULT_VOICE_ID;
    const isInstalled = isDefault || isVoiceDownloaded(def.id);

    return {
      id: def.id,
      name: `${def.name}${isDefault ? " (Default)" : ""}`,
      languageFamily: def.languageCode.split("_")[0] || "en",
      languageCode: def.languageCode,
      languageName: def.language,
      countryName: def.country,
      quality: def.quality,
      numSpeakers: 1,
      sampleUrl: "",
      isInstalled,
      sizeBytes: 522240, // ~510 KB
    };
  });

  // Sort installed first (with default at top), then alphabetical
  voices.sort((a, b) => {
    if (a.id === DEFAULT_VOICE_ID) return -1;
    if (b.id === DEFAULT_VOICE_ID) return 1;
    if (a.isInstalled && !b.isInstalled) return -1;
    if (!a.isInstalled && b.isInstalled) return 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ voices });
}
