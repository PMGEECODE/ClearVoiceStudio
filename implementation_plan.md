# Unified Voice Engine Abstraction (Piper + Kokoro ONNX)

This plan implements a unified voice engine architecture behind the scenes in **ClearVoice Studio** (`piper-tts-studio`), integrating **Kokoro ONNX** alongside the existing **Piper** engine. Users interact with a single, consolidated voice library without engine toggles or manual provider selection.

---

## Architecture Overview

```
                          ┌───────────────────────────┐
                          │   Frontend / UI Clients   │
                          │  (Single Unified Voice    │
                          │   Dropdown & Catalog)     │
                          └─────────────┬─────────────┘
                                        │
                                  /api/synthesize
                                  /api/voices
                                  /api/download-voice
                                        │
                          ┌─────────────▼─────────────┐
                          │   Unified Voice Engine    │
                          │  Dispatcher & Registry    │
                          └──────┬─────────────┬──────┘
                                 │             │
                    ┌────────────▼──┐       ┌──▼────────────┐
                    │ PiperProvider │       │ KokoroProvider│
                    └───────────────┘       └───────────────┘
```

1. **Unified Voice Registry & Dispatcher**:
   - Each voice has a static, designated engine (`provider: "piper" | "kokoro"`).
   - No random runtime switching based on speed or sentence length.
   - Preserves authentic acoustic qualities (e.g. Kokoro 24 kHz conversational cadence vs. Piper 22 kHz speed and accent diversity).

2. **Unified Model Detection & Download**:
   - The engine checks if the required model files exist locally in the user data / voices directory (`getPiperDownloadDir()`).
   - If a Kokoro voice is selected and `kokoro-v1.0.onnx` / `voices-v1.0.bin` are missing, `/api/download-voice` streams the download with real progress events just like Piper voices.
   - Once downloaded, generation runs completely offline.

3. **Single Voice Library in the UI**:
   - The user only sees voice names with natural descriptive attributes (e.g. `Heart (US Female)`, `Bella (US Female)`, `Adam (US Male)`, `Emma (UK Female)`, `Lessac (US)`, `Amy (US)`).
   - Engine choice is never exposed to the user.

---

## Proposed Changes

### 1. Unified Voice Engine Core (`src/lib/voice-engine/`)

#### [NEW] `src/lib/voice-engine/types.ts`
- Define `UnifiedVoiceInfo`:
  - `id`: Unique identifier (e.g. `kokoro:af_heart`, `piper:en_US-lessac-medium` or unified string ids)
  - `name`: Clean display name (e.g. "Heart", "Bella", "Adam", "Lessac", "Amy")
  - `language`: Display language (e.g. "English (US)", "English (UK)")
  - `country`: Country / region
  - `gender`: "female" | "male" | "neutral"
  - `quality`: "high" | "medium" | "conversational"
  - `sampleRate`: 24000 (Kokoro) | 22050 (Piper)
  - `provider`: "piper" | "kokoro"
  - `isInstalled`: boolean
  - `requiresDownload`: boolean
- Define `SynthesisOptions`:
  - `text`, `voiceId`, `speed` / `lengthScale`, `noiseScale`, `noiseWScale`, `sentenceSilence`
- Define `VoiceProvider` interface with `getId()`, `getVoices()`, `isVoiceInstalled()`, and `synthesize()`.

#### [NEW] `src/lib/voice-engine/piperProvider.ts`
- Encapsulates existing Piper functionality (Windows native `piper.exe` binary, or Linux/macOS Python server/CLI fallback).
- Returns list of available Piper voices with installation status.

#### [NEW] `src/lib/voice-engine/kokoroProvider.ts`
- Manages Kokoro ONNX model detection in `voices/kokoro/` (or user data directory).
- Bridges synthesis via Python Kokoro runner (`scripts/kokoro_runner.py` or `.venv`) outputting 24 kHz WAV buffer.
- Maps Kokoro voice styles:
  - `af_heart` ("Heart", US Female, Conversational)
  - `af_bella` ("Bella", US Female)
  - `af_sarah` ("Sarah", US Female)
  - `af_nicole` ("Nicole", US Female)
  - `am_adam` ("Adam", US Male)
  - `am_michael` ("Michael", US Male)
  - `bf_emma` ("Emma", UK Female)
  - `bf_isabella` ("Isabella", UK Female)
  - `bm_george` ("George", UK Male)
  - `bm_lewis` ("Lewis", UK Male)
- When Kokoro model files (`kokoro-v1.0.onnx` and `voices-v1.0.bin`) are present, all Kokoro voices are marked as installed.

#### [NEW] `src/lib/voice-engine/dispatcher.ts`
- Central registry: `getVoice(voiceId)`, `listAllVoices()`, `synthesizeVoice(options)`.
- Dispatches to `PiperProvider` or `KokoroProvider` based on the voice ID.

#### [NEW] `scripts/kokoro_runner.py`
- Lightweight Python runner executed by `kokoroProvider.ts` that loads Kokoro ONNX and generates audio with high performance and minimal overhead.

---

### 2. API Routes

#### [MODIFY] `src/app/api/voices/route.ts`
- Delegate to `dispatcher.listAllVoices()`.
- Returns single combined list of voices sorted cleanly (e.g. English conversational voices at top, followed by other accents and Piper regional voices).

#### [MODIFY] `src/app/api/synthesize/route.ts`
- Forward synthesis requests to `dispatcher.synthesizeVoice()`.
- Return proper headers, audio buffers, and error responses if a model is missing.
- Keep prosody enhancement and dialogue parsing working across both providers.

#### [MODIFY] `src/app/api/download-voice/route.ts`
- Add support for downloading Kokoro model assets (`kokoro-v1.0.onnx` and `voices-v1.0.bin`) using existing `secureDownloadFile` with checksum/resumption and streaming progress events.

---

### 3. Frontend / UI (`src/components/` & `src/app/`)

#### [MODIFY] `src/components/VoiceSettings.tsx`
- Ensure voice options display clean formatted names (e.g. "Heart (US Female • Conversational • 24000Hz)", "Lessac (US • 22050Hz)").
- Remove any references or hints to underlying engine names; treat all voices as part of ClearVoice Studio's unified voice library.
- If an uninstalled voice is selected, show an inline download button/prompt.

#### [MODIFY] `src/app/page.tsx`
- Handle automatic download prompting if the user picks an uninstalled voice and clicks Speak.
- Ensure audio playback smoothly adapts between 22,050 Hz (Piper) and 24,000 Hz (Kokoro).

---

## Verification Plan

### Automated & CLI Tests
1. **Unit Test for Dispatcher**:
   - Verify that requesting a Piper voice routes to `PiperProvider`.
   - Verify that requesting a Kokoro voice routes to `KokoroProvider`.
   - Verify error when an unknown voice ID is provided.
2. **Kokoro Synthesis Execution**:
   - Run synthesis through the unified API with `af_heart` and `en_US-lessac-medium`.
   - Confirm valid 24 kHz WAV for Kokoro and 22.05 kHz WAV for Piper.
3. **Download Route Verification**:
   - Test `/api/download-voice` for both a Piper voice and the Kokoro model bundle.
4. **App Build & Packaging**:
   - Run `npm run build` in `piper-tts-studio` to verify TypeScript types, bundle size, and build integrity.

### Manual UI Verification
- Open the studio app.
- Verify that the voice dropdown contains voices from both engines in one unified list.
- Select a Kokoro voice (e.g. `Heart`) and synthesize audio. Verify natural playback.
- Select a Piper voice (e.g. `Lessac`) and synthesize audio. Verify correct speech output.
- Test dialogue mode with mixed voices.
