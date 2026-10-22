import {
  UnifiedVoiceInfo,
  SynthesisRequestOptions,
  SynthesisResult,
  VoiceProvider,
} from "./types";
import { KokoroProvider } from "./kokoroProvider";
import { DEFAULT_VOICE_ID } from "@/lib/voiceStorage";

export class UnifiedVoiceDispatcher {
  private kokoro: KokoroProvider;
  private cachedVoices: UnifiedVoiceInfo[] | null = null;
  private lastVoicesFetch = 0;
  private static readonly CACHE_TTL_MS = 15000;

  constructor() {
    this.kokoro = new KokoroProvider();
  }

  /**
   * Invalidates the voice catalog cache (e.g. after downloading a new voice).
   */
  public invalidateCache(): void {
    this.cachedVoices = null;
    this.lastVoicesFetch = 0;
  }

  /**
   * Returns the single voice engine provider (Kokoro).
   */
  public getProviderForVoice(): VoiceProvider {
    return this.kokoro;
  }

  /**
   * Lists all available voices with installed status.
   * Installed voices appear first, starting with the default voice.
   */
  public async listAllVoices(forceRefresh = false): Promise<UnifiedVoiceInfo[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedVoices && now - this.lastVoicesFetch < UnifiedVoiceDispatcher.CACHE_TTL_MS) {
      return this.cachedVoices;
    }

    const voices = await this.kokoro.getVoices().catch(() => []);

    const sorted = voices.sort((a, b) => {
      // Default voice always first
      if (a.id === DEFAULT_VOICE_ID) return -1;
      if (b.id === DEFAULT_VOICE_ID) return 1;

      // Installed voices next
      if (a.isInstalled && !b.isInstalled) return -1;
      if (!a.isInstalled && b.isInstalled) return 1;

      return a.name.localeCompare(b.name);
    });

    this.cachedVoices = sorted;
    this.lastVoicesFetch = now;
    return sorted;
  }

  /**
   * Checks if the requested voice model files are ready for synthesis.
   */
  public async isVoiceInstalled(voiceId: string): Promise<boolean> {
    return this.kokoro.isVoiceInstalled(voiceId);
  }

  /**
   * Synthesizes audio using Kokoro.
   */
  public async synthesize(options: SynthesisRequestOptions): Promise<SynthesisResult> {
    return this.kokoro.synthesize(options);
  }
}

// Global singleton instance
export const voiceEngine = new UnifiedVoiceDispatcher();
