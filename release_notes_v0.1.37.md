## What's New in v0.1.37

> Built: 2026-09-18 · Repository: [PMGEECODE/ClearVoiceStudio](https://github.com/PMGEECODE/ClearVoiceStudio)

### 🎨 Desktop Header & Titlebar App Icon Display Fix
- Resolved an issue on desktop builds where unoptimized master image assets caused the 3D microphone app icon to expand out of place to giant dimensions across the application window.
- Generated optimized 128x128 high-DPI desktop icon assets (`cvs.png` in `src/assets/icon/` and `public/`) via the automated icon synchronization pipeline.
- Enforced strict pixel bounds (`26px` for window titlebar, `36px` for navigation header), aspect-ratio containment, `overflow: hidden`, and inline style clamps on both `DesktopTitleBar` and `Header` across Windows and Linux.

### 🎭 Theatrical Script Emotion Detection & Expressive Multi-Voice Synthesis
- ClearVoice Studio now understands theatrical and screenplay scripts, automatically detecting and acting on:
  - **Stage directions & emotional cues** — `[quietly]`, `[frustrated]`, `[holding back tears]`, `[raises his voice]`, `[calm but firm]`, `[shocked]`, `[hesitates]` are extracted and mapped to vocal delivery styles.
  - **Dramatic pause beats** — `[pause]`, `[long pause]`, and `[Silence.]` are converted into calibrated PCM silence intervals in the audio timeline (not spoken aloud).
  - **Scene headers & screenplay metadata** — `[SCENE 1 — ...]`, character bios (`**MAYA** — emotional, worried`), sound effects (`[Door opens.]`), and `[FADE OUT.]` are filtered and never fed to the TTS engine.
- Seven distinct **emotion-driven acoustic profiles** are applied per dialogue turn in real time:
  - **Whisper** (quietly, softly) — slower, reduced breathiness, intimate attack
  - **Agitated** (frustrated, raises voice) — accelerated tempo, high dynamic energy
  - **Vulnerable** (tears, worried, hesitant) — drawn-out cadence, duration variability
  - **Firm** (calm but firm, serious) — steady, authoritative pacing
  - **Shocked** (stunned, gasps) — sudden, abrupt delivery
  - **Hesitant** (hesitates, uncertain) — prolonged pause beats, uncertain timing
  - **Neutral** — standard conversational cadence
- **Character Bio Parsing**: Character descriptions like `MAYA — emotional, worried, trying to stay strong` auto-infer voice gender and dominant emotion for voice suggestion.
- Acoustic modulation applies to both **Piper** (via `length_scale`, `noise_scale`, `noise_w_scale` parameters) and **Kokoro** neural engine (speed conditioning).
- Inter-turn pauses are extended by emotion — e.g. vulnerable/whisper lines naturally breathe longer before the next line.

### ✨ Emotion-aware Kokoro delivery
- Added a local, dependency-free sentence emotion layer for all Kokoro synthesis, including ordinary prose and dialogue.
- The layer uses bounded speed and pause changes, click-safe sentence joins, confidence smoothing, and a user-controlled intensity setting; it preserves the selected voice rather than attempting unsupported style-embedding blends.
- Disable **Emotion-aware delivery** for byte-for-byte use of the previous Kokoro synthesis path.

### 🎙️ Multi-voice dialogue (Windows)
- Fixed **“Dialogue voices produced incompatible WAV formats”** when a script uses multiple speakers with different voice models
- Each clip is **normalized and resampled** to a common format before mixing, so casts like `en_GB-alan` + `en_US-hfc_male` + `en_US-lessac` work together

### 🎬 MP3 & MP4 export (Windows)
- Fixed **`spawn ffmpeg ENOENT`** on **Download MP3** and **Download MP4 Video (With Soundwave)**
- **FFmpeg is bundled** with the app — no separate install or PATH configuration required (WAV export unchanged)

---

### 📦 Downloads

| Platform | Artifact |
|----------|----------|
| Windows | `ClearVoiceStudio-Setup-0.1.37.exe` |
| Linux | `ClearVoiceStudio-0.1.37.AppImage` |
| Linux | `ClearVoiceStudio-0.1.37.deb` |
