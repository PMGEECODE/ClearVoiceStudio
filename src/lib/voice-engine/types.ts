export type VoiceEngineProvider = "kokoro";

export interface UnifiedVoiceInfo {
  id: string;
  name: string;
  displayName: string;
  language: string;
  languageCode: string;
  country: string;
  gender: "female" | "male" | "neutral";
  quality: string;
  sampleRate: number;
  numSpeakers: number;
  speakers?: Record<string, number>;
  provider: VoiceEngineProvider;
  isInstalled: boolean;
  requiresDownload: boolean;
  downloadLabel?: string;
  sizeBytes?: number;
}

export interface SynthesisRequestOptions {
  text: string;
  voiceId: string;
  speakerId?: number;
  lengthScale?: number;
  noiseScale?: number;
  noiseWScale?: number;
  sentenceSilence?: number;
  prosodyEnabled?: boolean;
  prosodyProfile?: string;
  emotionMode?: boolean;
  emotionIntensity?: number;
  emotionHint?: string;
}

export interface SynthesisResult {
  audioBuffer: Buffer;
  sampleRate: number;
  provider: VoiceEngineProvider;
  engineMode: string;
}

export interface VoiceProvider {
  readonly id: VoiceEngineProvider;
  isReady(): Promise<boolean>;
  getVoices(): Promise<UnifiedVoiceInfo[]>;
  isVoiceInstalled(voiceId: string): Promise<boolean>;
  synthesize(options: SynthesisRequestOptions): Promise<SynthesisResult>;
}
