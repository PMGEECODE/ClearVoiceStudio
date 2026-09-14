"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  FileText,
  Upload,
  Zap,
  Volume2,
  AlertCircle,
  Loader2,
  DownloadCloud,
  UserCheck,
  Mic,
  MicOff,
  Cpu,
  Radio,
  Square,
  Timer,
  ChevronDown,
  ChevronUp,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { Header } from "@/components/Header";
import { AudioPlayer } from "@/components/AudioPlayer";
import { VoiceSettings, VoiceConfigState } from "@/components/VoiceSettings";
import { HistoryDrawer, GenerationHistoryItem } from "@/components/HistoryDrawer";
import { VoiceCatalogModal } from "@/components/VoiceCatalogModal";
import { CastVoiceManager } from "@/components/CastVoiceManager";
import { SynthesisProgressBar } from "@/components/SynthesisProgressBar";
import { LiveMicrophoneVisualizer } from "@/components/LiveMicrophoneVisualizer";
import { EditorFooter, EditorPresets } from "@/components/EditorToolbar";
import { AppStatusBar } from "@/components/AppStatusBar";
import { VoiceModelInfo } from "./api/voices/route";
import {
  createDictationController,
  DictationController,
  DictationMode,
  DictationStatus,
} from "@/lib/dictation";
import {
  ScriptSpeaker,
  SynthesisProgressState,
  analyzeScriptText,
} from "@/lib/scriptAnalysis";

export default function Home() {
  // Engine & Server State
  const [engineStatus, setEngineStatus] = useState<"online" | "offline" | "loading">("loading");
  const [latencyMs, setLatencyMs] = useState<number | undefined>(undefined);
  const [voices, setVoices] = useState<VoiceModelInfo[]>([]);

  // Editor State
  const [activeTab, setActiveTab] = useState<"editor" | "upload">("editor");
  const [text, setText] = useState<string>(
    "Welcome to ClearVoice Studio. Select any voice above and type or speak to synthesize natural speech."
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Hands-Free Voice Dictation (Speech-to-Text) State
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isMutedDictation, setIsMutedDictation] = useState<boolean>(false);
  const isMutedDictationRef = useRef<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [dictationMode, setDictationMode] = useState<DictationMode | null>(null);
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>("idle");
  const [dictationStartedAt, setDictationStartedAt] = useState<number | null>(null);
  const [dictationElapsed, setDictationElapsed] = useState<number>(0);
  const dictationControllerRef = useRef<DictationController | null>(null);

  // Sync isMutedDictation ref for event listeners
  useEffect(() => {
    isMutedDictationRef.current = isMutedDictation;
  }, [isMutedDictation]);

  useEffect(() => {
    if (dictationStatus !== "recording" || !dictationStartedAt) {
      if (dictationStatus === "idle") setDictationElapsed(0);
      return;
    }

    const tick = () => {
      setDictationElapsed(Math.max(0, Math.floor((Date.now() - dictationStartedAt) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [dictationStartedAt, dictationStatus]);

  // Type-to-Speak Listener Settings
  const [typeToSpeakEnabled, setTypeToSpeakEnabled] = useState<boolean>(false);
  const [typeDebounceDelay, setTypeDebounceDelay] = useState<number>(1000);
  const [typeListenerState, setTypeListenerState] = useState<
    "idle" | "typing" | "synthesizing" | "speaking"
  >("idle");

  // Synthesis & Audio State
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [autoPlayAudio] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [synthesisProgress, setSynthesisProgress] = useState<SynthesisProgressState>(null);

  // Voice Configuration
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfigState>({
    voice: "en_US-lessac-medium",
    speakerId: 0,
    lengthScale: 1.0,
    noiseScale: 0.667,
    noiseWScale: 0.8,
    sentenceSilence: 0.2,
    prosodyEnabled: true,
    prosodyProfile: "conversational",
    prosodyDebug: false,
  });
  const [castVoiceMap, setCastVoiceMap] = useState<Record<string, string>>({});
  const scriptAnalysis = useMemo(() => analyzeScriptText(text), [text]);

  // Voice Catalog Modal State
  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [showAllVoices, setShowAllVoices] = useState<boolean>(false);

  // History
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);

  // Refs
  const typeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const synthesisProgressRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSynthesisIdRef = useRef<number>(0);
  const lastAutoSynthTextRef = useRef<string>("");
  const [dragOver, setDragOver] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (synthesisProgressRef.current) {
        clearInterval(synthesisProgressRef.current);
      }
      if (typeTimeoutRef.current) {
        clearTimeout(typeTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const suggestVoiceForSpeaker = useCallback(
    (speaker: ScriptSpeaker, index: number, usedVoiceIds: Set<string>) => {
      if (voices.length === 0) return voiceConfig.voice;

      const gender = speaker.gender;
      const maleHints = ["alan", "male", "ryan", "joe", "danny", "kusal", "arctic"];
      const femaleHints = ["amy", "lessac", "cori", "female", "kathleen", "libritts", "ljspeech"];
      const hints = gender === "male" ? maleHints : gender === "female" ? femaleHints : [];
      const genderMatches = voices.filter((voice) => {
        const id = voice.id.toLowerCase();
        return hints.some((hint) => id.includes(hint));
      });
      const unusedGenderMatch = genderMatches.find((voice) => !usedVoiceIds.has(voice.id));
      if (unusedGenderMatch) return unusedGenderMatch.id;
      if (genderMatches[0]) return genderMatches[0].id;

      const unusedVoice = voices.find((voice) => !usedVoiceIds.has(voice.id));
      return unusedVoice?.id || voices[index % voices.length]?.id || voiceConfig.voice;
    },
    [voiceConfig.voice, voices]
  );

  useEffect(() => {
    if (scriptAnalysis.mode !== "dialogue") {
      setCastVoiceMap({});
      return;
    }

    setCastVoiceMap((prev) => {
      const next: Record<string, string> = {};
      const used = new Set<string>();

      scriptAnalysis.speakers.forEach((speaker, index) => {
        const existingVoice = prev[speaker.key];
        const validExistingVoice = voices.some((voice) => voice.id === existingVoice);
        const voiceId = validExistingVoice
          ? existingVoice
          : suggestVoiceForSpeaker(speaker, index, used);
        next[speaker.key] = voiceId;
        used.add(voiceId);
      });

      const unchanged =
        Object.keys(next).length === Object.keys(prev).length &&
        Object.entries(next).every(([key, voiceId]) => prev[key] === voiceId);
      return unchanged ? prev : next;
    });
  }, [scriptAnalysis, suggestVoiceForSpeaker, voices]);

  // 1. Initial Health Check & Voices fetch
  const checkStatusAndVoices = useCallback(async () => {
    try {
      const statusRes = await fetch("/api/status");
      if (statusRes.ok) {
        const data = await statusRes.json();
        setEngineStatus("online");
        setLatencyMs(data.latencyMs);
      } else {
        setEngineStatus("offline");
      }

      const voicesRes = await fetch("/api/voices");
      if (voicesRes.ok) {
        const data = await voicesRes.json();
        if (data.voices && data.voices.length > 0) {
          setVoices(data.voices);
          if (!data.voices.some((v: VoiceModelInfo) => v.id === voiceConfig.voice)) {
            setVoiceConfig((prev) => ({ ...prev, voice: data.voices[0].id }));
          }
        }
      }
    } catch {
      setEngineStatus("offline");
    }
  }, [voiceConfig.voice]);

  useEffect(() => {
    checkStatusAndVoices();
    const interval = setInterval(checkStatusAndVoices, 15000);
    return () => clearInterval(interval);
  }, [checkStatusAndVoices]);

  // Check Dictation Support (Web Speech API or on-device Whisper fallback)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasMic = Boolean(navigator.mediaDevices?.getUserMedia);
      setSpeechSupported(hasMic);
    }
  }, []);

  const estimateSynthesisWork = useCallback((script: string) => {
    const analysis = analyzeScriptText(script);
    const turns = analysis.mode === "dialogue" ? analysis.turns : 1;
    const estimatedSeconds = Math.max(5, Math.min(90, Math.ceil(script.length / 180) + turns * 3));
    return { turns, estimatedSeconds };
  }, []);

  const startSynthesisProgress = useCallback((script: string) => {
    if (synthesisProgressRef.current) {
      clearInterval(synthesisProgressRef.current);
    }

    const startedAt = Date.now();
    const { turns, estimatedSeconds } = estimateSynthesisWork(script);
    const isDialogue = turns > 1;

    setSynthesisProgress({
      percent: 6,
      label: "Preparing synthesis",
      detail: isDialogue
        ? `Detected ${turns} dialogue turns. Assigning voices to the cast.`
        : "Preparing the selected voice and script text.",
      turns,
      elapsedSeconds: 0,
    });

    synthesisProgressRef.current = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const rawPercent = 8 + (elapsedSeconds / estimatedSeconds) * 84;
      const percent = Math.min(92, Math.round(rawPercent));
      const turnEstimate = Math.min(turns, Math.max(1, Math.ceil((percent / 92) * turns)));

      let label = "Rendering voice";
      let detail = isDialogue
        ? `Rendering turn ${turnEstimate} of ${turns}.`
        : "Rendering speech audio.";

      if (percent >= 72) {
        label = isDialogue ? "Mixing dialogue" : "Polishing audio";
        detail = isDialogue
          ? "Joining speaker turns and adding natural pauses."
          : "Finalizing timing and WAV output.";
      } else if (percent >= 38 && isDialogue) {
        label = "Rendering speaker turns";
      }

      setSynthesisProgress({
        percent,
        label,
        detail,
        turns,
        elapsedSeconds,
      });
    }, 450);
  }, [estimateSynthesisWork]);

  const finishSynthesisProgress = useCallback((success: boolean) => {
    if (synthesisProgressRef.current) {
      clearInterval(synthesisProgressRef.current);
      synthesisProgressRef.current = null;
    }

    setSynthesisProgress((prev) =>
      prev
        ? {
            ...prev,
            percent: success ? 100 : prev.percent,
            label: success ? "Speech ready" : "Synthesis stopped",
            detail: success ? "Audio is ready to preview or export." : "No audio was generated.",
          }
        : null
    );

    setTimeout(() => {
      setSynthesisProgress(null);
    }, success ? 1200 : 1800);
  }, []);

  // 2. Synthesis Action
  const synthesizeText = useCallback(
    async (
      textToSpeak: string,
      isAutoTrigger: boolean = false
    ): Promise<string | null> => {
      const cleanText = textToSpeak.trim();
      if (!cleanText) return null;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      const synthesisId = activeSynthesisIdRef.current + 1;
      activeSynthesisIdRef.current = synthesisId;

      setIsSynthesizing(true);
      setErrorMessage(null);
      startSynthesisProgress(cleanText);
      if (isAutoTrigger) {
        lastAutoSynthTextRef.current = cleanText;
      }
      if (isAutoTrigger) {
        setTypeListenerState("synthesizing");
      }

      try {
        const response = await fetch("/api/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: cleanText,
            voice: voiceConfig.voice,
            speaker_id: voiceConfig.speakerId,
            length_scale: voiceConfig.lengthScale,
            noise_scale: voiceConfig.noiseScale,
            noise_w_scale: voiceConfig.noiseWScale,
            sentence_silence: voiceConfig.sentenceSilence,
            speaker_voices: scriptAnalysis.mode === "dialogue" ? castVoiceMap : undefined,
            prosody_enabled: voiceConfig.prosodyEnabled,
            prosody_profile: voiceConfig.prosodyProfile,
            prosody_debug: voiceConfig.prosodyDebug,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Synthesis failed with status ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        if (activeSynthesisIdRef.current !== synthesisId) {
          URL.revokeObjectURL(blobUrl);
          return null;
        }
        finishSynthesisProgress(true);
        lastAutoSynthTextRef.current = cleanText;

        setCurrentAudioUrl(blobUrl);
        if (isAutoTrigger) {
          setTypeListenerState("speaking");
          setTimeout(() => setTypeListenerState("idle"), 2000);
        }

        const historyItem: GenerationHistoryItem = {
          id: Math.random().toString(36).substring(2, 9),
          text: cleanText,
          voice: voiceConfig.voice,
          timestamp: Date.now(),
          audioBlobUrl: blobUrl,
        };
        setHistory((prev) => [historyItem, ...prev.slice(0, 19)]);

        return blobUrl;
      } catch (err: unknown) {
        if (activeSynthesisIdRef.current !== synthesisId) {
          return null;
        }
        if (err instanceof Error && err.name === "AbortError") {
          finishSynthesisProgress(false);
          if (isAutoTrigger) {
            lastAutoSynthTextRef.current = "";
          }
          return null;
        }
        const msg = err instanceof Error ? err.message : "Synthesis error occurred";
        setErrorMessage(msg);
        finishSynthesisProgress(false);
        if (isAutoTrigger) {
          lastAutoSynthTextRef.current = "";
        }
        if (isAutoTrigger) setTypeListenerState("idle");
        return null;
      } finally {
        if (activeSynthesisIdRef.current === synthesisId) {
          setIsSynthesizing(false);
        }
      }
    },
    [
      castVoiceMap,
      finishSynthesisProgress,
      scriptAnalysis.mode,
      startSynthesisProgress,
      voiceConfig,
    ]
  );

  // 3. Hands-Free Voice Dictation (Speech-to-Text Listener)
  const toggleListening = () => {
    if (dictationStatus === "processing" || dictationStatus === "loading-model") {
      return;
    }

    if (isListening) {
      if (dictationControllerRef.current) {
        dictationControllerRef.current.stop();
      }
      setIsListening(false);
      setIsMutedDictation(false);
      return;
    }

    if (typeof window === "undefined") return;

    try {
      setDictationStatus("starting");
      setInterimTranscript("Preparing microphone...");
      const controller = createDictationController({
        onStart: () => {
          setIsListening(true);
          setIsMutedDictation(false);
          setErrorMessage(null);
          setDictationStartedAt(Date.now());
        },
        onInterim: (interim) => {
          if (!isMutedDictationRef.current) {
            setInterimTranscript(interim);
          }
        },
        onFinal: (chunk) => {
          if (isMutedDictationRef.current) return;
          setText((prev) => {
            const separator = prev && !prev.endsWith(" ") ? " " : "";
            return `${prev}${separator}${chunk.trim()}`;
          });
        },
        onError: (err) => {
          setErrorMessage(err);
          setIsListening(false);
          setIsMutedDictation(false);
          setDictationStatus("idle");
          setDictationStartedAt(null);
          setInterimTranscript("");
        },
        onEnd: () => {
          setIsListening(false);
          setIsMutedDictation(false);
          setDictationStartedAt(null);
          setTimeout(() => {
            setInterimTranscript("");
          }, 900);
        },
        onModeChange: (mode) => {
          setDictationMode(mode);
        },
        onStatusChange: (status) => {
          setDictationStatus(status);
        },
      });

      dictationControllerRef.current = controller;
      controller.start();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to access microphone";
      setErrorMessage(msg);
      setIsListening(false);
      setIsMutedDictation(false);
      setDictationStatus("idle");
      setDictationStartedAt(null);
    }
  };

  const toggleMuteDictation = () => {
    setIsMutedDictation((prev) => {
      const next = !prev;
      if (next) {
        setInterimTranscript("(Muted - outside speech ignored)");
      } else {
        setInterimTranscript("");
      }
      return next;
    });
  };

  const formatDictationTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isDictationBusy = dictationStatus === "processing" || dictationStatus === "loading-model";
  const isDictationPanelVisible = dictationStatus !== "idle" || isListening || Boolean(interimTranscript);
  const dictationModeLabel =
    dictationMode === "whisper-wasm"
      ? "Whisper local"
      : dictationMode === "browser-native"
      ? "Browser live"
      : "Auto detect";
  const dictationStatusLabel =
    dictationStatus === "starting"
      ? "Preparing mic"
      : dictationStatus === "recording"
      ? isMutedDictation
        ? "Mic muted"
        : "Recording"
      : dictationStatus === "switching"
      ? "Switching engine"
      : dictationStatus === "loading-model"
      ? "Loading Whisper"
      : dictationStatus === "processing"
      ? "Transcribing"
      : "Ready";

  // 4. Real-Time Type-To-Speak Listener Effect
  useEffect(() => {
    // If dictation is currently actively hearing or muted, or type-to-speak is disabled
    if (!typeToSpeakEnabled || isMutedDictation) {
      if (typeTimeoutRef.current) clearTimeout(typeTimeoutRef.current);
      setTypeListenerState("idle");
      return;
    }

    if (isSynthesizing) {
      if (typeTimeoutRef.current) clearTimeout(typeTimeoutRef.current);
      return;
    }

    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 3) {
      lastAutoSynthTextRef.current = "";
      setTypeListenerState("idle");
      return;
    }

    if (lastAutoSynthTextRef.current === trimmed) {
      if (typeTimeoutRef.current) clearTimeout(typeTimeoutRef.current);
      setTypeListenerState("idle");
      return;
    }

    setTypeListenerState("typing");

    if (typeTimeoutRef.current) {
      clearTimeout(typeTimeoutRef.current);
    }

    const endsWithPunctuation = /[.!?\n]$/.test(trimmed);
    const delay = endsWithPunctuation ? Math.min(600, typeDebounceDelay) : typeDebounceDelay;

    typeTimeoutRef.current = setTimeout(() => {
      synthesizeText(trimmed, true);
    }, delay);

    return () => {
      if (typeTimeoutRef.current) {
        clearTimeout(typeTimeoutRef.current);
      }
    };
  }, [
    text,
    typeToSpeakEnabled,
    typeDebounceDelay,
    synthesizeText,
    isMutedDictation,
    isSynthesizing,
  ]);

  // 5. File Upload Handler
  const handleFileUpload = (file: File) => {
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setText(content);
        setActiveTab("editor");
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Metrics
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estSeconds = Math.round((wordCount / 140) * 60);

  return (
    <div className="app-viewport-root">
      <Header
        status={engineStatus}
        latencyMs={latencyMs}
        activeVoice={voiceConfig.voice}
      />

      <div className="studio-body-scroll">
        <main className="container studio-layout">
          {/* Left Column: Script & Input Studio */}
          <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className="glass-card">
              {/* Card Header with Tabs */}
              <div className="card-header">
              <div className="card-title-group">
                <FileText size={18} style={{ color: "var(--accent-primary)" }} />
                <div>
                  <h2 className="card-title">Speech Script Studio</h2>
                  <p className="card-desc">Type, dictate hands-free, or upload scripts to generate voice</p>
                </div>
              </div>

              <div className="tabs-wrapper">
                <button
                  type="button"
                  className={`tab-btn ${activeTab === "editor" ? "active" : ""}`}
                  onClick={() => setActiveTab("editor")}
                >
                  <FileText size={14} />
                  <span>Editor</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === "upload" ? "active" : ""}`}
                  onClick={() => setActiveTab("upload")}
                >
                  <Upload size={14} />
                  <span>Upload Script</span>
                </button>
              </div>
            </div>

            <div className="card-body">
              {/* Quick Voice Toggle Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  marginBottom: "1rem",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(10, 14, 23, 0.6)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)" }}>
                    Voice:
                  </span>

                  {voices.length === 0 ? (
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Loading voices...
                    </span>
                  ) : showAllVoices ? (
                    voices.map((v) => {
                      const isSelected = voiceConfig.voice === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() =>
                            setVoiceConfig((prev) => ({ ...prev, voice: v.id, speakerId: 0 }))
                          }
                          style={{
                            background: isSelected
                              ? "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))"
                              : "rgba(255, 255, 255, 0.05)",
                            color: isSelected ? "#fff" : "var(--text-muted)",
                            border: isSelected
                              ? "1px solid var(--accent-primary)"
                              : "1px solid var(--border-subtle)",
                            padding: "0.3rem 0.65rem",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.78rem",
                            fontWeight: isSelected ? 600 : 400,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            transition: "var(--transition)",
                          }}
                        >
                          {isSelected && <UserCheck size={13} />}
                          <span>{v.id.replace(/-medium|-low|-high/g, "")}</span>
                        </button>
                      );
                    })
                  ) : (
                    (() => {
                      const activeVoice =
                        voices.find((v) => v.id === voiceConfig.voice) || voices[0];
                      if (!activeVoice) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => setShowAllVoices(true)}
                          title="Click to view all voices"
                          style={{
                            background:
                              "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
                            color: "#fff",
                            border: "1px solid var(--accent-primary)",
                            padding: "0.3rem 0.65rem",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            transition: "var(--transition)",
                          }}
                        >
                          <UserCheck size={13} />
                          <span>{activeVoice.id.replace(/-medium|-low|-high/g, "")}</span>
                        </button>
                      );
                    })()
                  )}

                  {voices.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowAllVoices((prev) => !prev)}
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        color: "var(--text-muted)",
                        border: "1px solid var(--border-subtle)",
                        padding: "0.3rem 0.6rem",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.76rem",
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        transition: "var(--transition)",
                      }}
                      title={showAllVoices ? "Collapse voice list" : "Show all available voices"}
                    >
                      {showAllVoices ? (
                        <>
                          <ChevronUp size={13} />
                          <span>Show Less</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown size={13} />
                          <span>Change (+{voices.length - 1})</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsCatalogOpen(true)}
                  style={{
                    background: "var(--accent-primary-light)",
                    color: "var(--accent-primary)",
                    border: "1px solid var(--border-active)",
                    padding: "0.3rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    transition: "var(--transition)",
                  }}
                >
                  <DownloadCloud size={14} />
                  <span>+ Browse & Download 170+ Voices</span>
                </button>
              </div>

              {errorMessage && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1rem",
                    marginBottom: "1rem",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(244, 63, 94, 0.12)",
                    border: "1px solid rgba(244, 63, 94, 0.3)",
                    color: "var(--accent-rose)",
                    fontSize: "0.85rem",
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {activeTab === "editor" ? (
                <>
                  {/* Textarea with hands-free listening & mute banner */}
                  <div className="editor-textarea-wrapper">
                    <textarea
                      className="editor-textarea"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Enter, dictate hands-free, or paste speech script here..."
                      rows={8}
                    />

                    {isDictationPanelVisible && (
                      <div className={`dictation-panel dictation-panel-${dictationStatus}`}>
                        <div className="dictation-orb-wrap">
                          <div
                            className={`dictation-orb ${
                              dictationStatus === "recording" && !isMutedDictation
                                ? "recording"
                                : ""
                            } ${isDictationBusy ? "processing" : ""}`}
                          >
                            {dictationMode === "whisper-wasm" ? <Cpu size={18} /> : <Radio size={18} />}
                          </div>
                        </div>

                        <div className="dictation-copy">
                          <div className="dictation-topline">
                            <span className="dictation-status">{dictationStatusLabel}</span>
                            <span className="dictation-pill">{dictationModeLabel}</span>
                            {dictationStatus === "recording" && (
                              <span className="dictation-time">
                                <Timer size={12} />
                                {formatDictationTime(dictationElapsed)}
                              </span>
                            )}
                          </div>
                          <p className="dictation-message">
                            {isMutedDictation
                              ? "Microphone is paused. Background speech will not be added."
                              : interimTranscript && !interimTranscript.startsWith("(")
                              ? interimTranscript
                              : dictationStatus === "processing" || dictationStatus === "loading-model"
                              ? interimTranscript || "Converting your recording into text."
                              : dictationStatus === "starting"
                              ? "Requesting microphone access and preparing the recorder."
                              : "Speak naturally. Your words will appear in the editor."}
                          </p>
                          <LiveMicrophoneVisualizer
                            isRecording={dictationStatus === "recording"}
                            isMuted={isMutedDictation}
                            isBusy={isDictationBusy}
                          />
                        </div>

                        <div className="dictation-actions">
                          <button
                            type="button"
                            className={`dictation-mini-btn ${isMutedDictation ? "active" : ""}`}
                            onClick={toggleMuteDictation}
                            disabled={!isListening || isDictationBusy}
                            title={isMutedDictation ? "Resume recording" : "Pause microphone capture"}
                          >
                            {isMutedDictation ? <Mic size={14} /> : <MicOff size={14} />}
                            <span>{isMutedDictation ? "Unmute" : "Mute"}</span>
                          </button>

                          <button
                            type="button"
                            className="dictation-mini-btn strong"
                            onClick={toggleListening}
                            disabled={!isListening || isDictationBusy}
                            title="Finish recording and add transcription"
                          >
                            <Square size={13} />
                            <span>{dictationMode === "whisper-wasm" ? "Submit" : "Finish"}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Editor Footer Info */}
                    <EditorFooter
                      charCount={charCount}
                      wordCount={wordCount}
                      estSeconds={estSeconds}
                      uploadedFileName={uploadedFileName}
                      copied={copied}
                      onCopy={handleCopyText}
                      onClear={() => {
                        setText("");
                        setUploadedFileName(null);
                      }}
                      isListening={isListening}
                      isMutedDictation={isMutedDictation}
                      isDictationBusy={isDictationBusy}
                      speechSupported={speechSupported}
                      onToggleListening={toggleListening}
                      onGenerate={() => synthesizeText(text, false)}
                      isSynthesizing={isSynthesizing}
                    />
                  </div>

                  {/* Real-Time Type-to-Speak Listener Banner */}
                  <div className="type-to-speak-banner">
                    <div className="type-to-speak-info">
                      <div className="type-icon">
                        <Zap size={18} />
                      </div>
                      <div className="type-text">
                        <h4>
                          Type-to-Speak Mode
                          {typeToSpeakEnabled && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.15rem 0.5rem",
                                borderRadius: "var(--radius-full)",
                                background:
                                  typeListenerState === "speaking"
                                    ? "var(--accent-emerald-light)"
                                    : typeListenerState === "synthesizing"
                                    ? "var(--accent-primary-light)"
                                    : typeListenerState === "typing"
                                    ? "rgba(245, 158, 11, 0.2)"
                                    : "rgba(255, 255, 255, 0.08)",
                                color:
                                  typeListenerState === "speaking"
                                    ? "var(--accent-emerald)"
                                    : typeListenerState === "synthesizing"
                                    ? "var(--accent-primary)"
                                    : typeListenerState === "typing"
                                    ? "var(--accent-amber)"
                                    : "var(--text-muted)",
                                fontWeight: 500,
                              }}
                            >
                              {typeListenerState === "typing" && "⌨️ Pausing to speak..."}
                              {typeListenerState === "synthesizing" && "⏳ Synthesizing..."}
                              {typeListenerState === "speaking" && "🔊 Playing speech"}
                              {typeListenerState === "idle" && "Listening to typing"}
                            </span>
                          )}
                        </h4>
                        <p>
                          Automatically synthesize and play voice as you finish typing or dictating
                        </p>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      {typeToSpeakEnabled && (
                        <select
                          className="select-input"
                          style={{
                            padding: "0.3rem 0.6rem",
                            fontSize: "0.75rem",
                            width: "auto",
                          }}
                          value={typeDebounceDelay}
                          onChange={(e) =>
                            setTypeDebounceDelay(parseInt(e.target.value, 10))
                          }
                          title="Typing pause delay before voice triggers"
                        >
                          <option value={700}>Fast (0.7s)</option>
                          <option value={1000}>Normal (1.0s)</option>
                          <option value={1500}>Relaxed (1.5s)</option>
                        </select>
                      )}

                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={typeToSpeakEnabled}
                          onChange={(e) => setTypeToSpeakEnabled(e.target.checked)}
                        />
                        <span className="slider-toggle" />
                      </label>
                    </div>
                  </div>

                  {/* Script Analysis & Cast Voice Manager */}
                  <CastVoiceManager
                    analysis={scriptAnalysis}
                    castVoiceMap={castVoiceMap}
                    onCastVoiceChange={(speakerKey, voiceId) =>
                      setCastVoiceMap((prev) => ({ ...prev, [speakerKey]: voiceId }))
                    }
                    voices={voices}
                    currentVoice={voiceConfig.voice}
                    disabled={isSynthesizing}
                  />

                  {/* Quick Presets */}
                  <EditorPresets onSelectPreset={(presetText) => setText(presetText)} />

                  {/* Synthesis Progress Bar */}
                  <SynthesisProgressBar progress={synthesisProgress} />

                  {/* Manual Generate Action Row with Dictation and Mute Controls */}
                  <div className="action-row" style={{ flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => synthesizeText(text, false)}
                      disabled={isSynthesizing || !text.trim()}
                    >
                      {isSynthesizing ? (
                        <>
                          <Loader2 size={18} className="spin" />
                          <span>Synthesizing Voice...</span>
                        </>
                      ) : (
                        <>
                          <Volume2 size={18} />
                          <span>Generate Speech</span>
                        </>
                      )}
                    </button>

                    {/* Dictate Start / Stop Button */}
                    {!isListening ? (
                      <button
                        type="button"
                        onClick={toggleListening}
                        className={`btn-primary btn-dictation-main ${
                          isDictationBusy ? "btn-dictation-processing" : ""
                        }`}
                        disabled={!speechSupported || isDictationBusy}
                        title="Hands-free voice dictation (Speech-to-Text)"
                      >
                        {isDictationBusy ? (
                          <Loader2 size={18} className="spin" />
                        ) : (
                          <Mic size={18} />
                        )}
                        <span>{isDictationBusy ? "Transcribing Recording..." : "Start Dictation"}</span>
                      </button>
                    ) : (
                      <>
                        {/* Mute / Unmute Mic Button */}
                        <button
                          type="button"
                          onClick={toggleMuteDictation}
                          className={`btn-primary btn-dictation-secondary ${
                            isMutedDictation ? "muted" : ""
                          }`}
                          disabled={isDictationBusy}
                          title={
                            isMutedDictation
                              ? "Unmute mic to resume capturing speech"
                              : "Mute mic to ignore outside chatter"
                          }
                        >
                          {isMutedDictation ? <Mic size={18} /> : <MicOff size={18} />}
                          <span>{isMutedDictation ? "Unmute Mic" : "Mute Mic"}</span>
                        </button>

                        {/* Stop Dictation Button */}
                        <button
                          type="button"
                          onClick={toggleListening}
                          className="btn-primary btn-dictation-submit"
                          disabled={isDictationBusy}
                          title="Finish and stop voice dictation"
                        >
                          <Square size={16} />
                          <span>{dictationMode === "whisper-wasm" ? "Submit Recording" : "Finish Dictation"}</span>
                        </button>
                      </>
                    )}

                    {/* Clear Button */}
                    <button
                      type="button"
                      className="btn-action-ghost"
                      onClick={() => {
                        setText("");
                        setUploadedFileName(null);
                      }}
                      disabled={!text.trim() && !uploadedFileName}
                      title="Clear text from the script editor"
                      aria-label="Clear script"
                    >
                      <RotateCcw size={16} />
                      <span>Clear</span>
                    </button>

                    {/* Delete Button (clears script & resets generated speech audio) */}
                    <button
                      type="button"
                      className="btn-action-danger"
                      onClick={() => {
                        setText("");
                        setUploadedFileName(null);
                        if (currentAudioUrl) {
                          setCurrentAudioUrl(null);
                        }
                        setErrorMessage(null);
                      }}
                      disabled={!text.trim() && !currentAudioUrl && !uploadedFileName}
                      title="Delete script and reset generated audio"
                      aria-label="Delete script and audio"
                    >
                      <Trash2 size={16} />
                      <span>Delete</span>
                    </button>
                  </div>
                </>
              ) : (
                /* Upload Tab */
                <div
                  className={`dropzone ${dragOver ? "drag-active" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("file-upload-input")?.click()}
                >
                  <input
                    id="file-upload-input"
                    type="file"
                    accept=".txt,.md,.vtt,.srt,.csv,.json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="dropzone-icon">
                    <Upload size={24} />
                  </div>
                  <h3 className="dropzone-title">
                    Drop your script file here or click to browse
                  </h3>
                  <p className="dropzone-subtitle">
                    Supports .txt, .md, .csv, and subtitle transcript files
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Audio Player & Voice Settings Stack */}
        <section className="sidebar-stack">
          {/* Audio Player & Multi-Format Export (WAV / MP4 Audio / MP4 Video) */}
          <AudioPlayer
            audioUrl={currentAudioUrl}
            textSnippet={text}
            voiceName={voiceConfig.voice}
            autoPlay={autoPlayAudio}
          />

          {/* Voice & Tuning Parameters */}
          <VoiceSettings
            voices={voices}
            config={voiceConfig}
            onChange={setVoiceConfig}
            onOpenCatalog={() => setIsCatalogOpen(true)}
            disabled={isSynthesizing}
          />

          {/* Session Generations History */}
          <HistoryDrawer
            history={history}
            onPlayItem={(item) => {
              setCurrentAudioUrl(item.audioBlobUrl);
            }}
            onLoadText={(historyText) => {
              setText(historyText);
              setActiveTab("editor");
            }}
            onClearHistory={() => setHistory([])}
          />
        </section>
      </main>
      </div>

      {/* Desktop App Status Bar */}
      <AppStatusBar
        engineStatus={engineStatus}
        latencyMs={latencyMs}
        activeVoice={voiceConfig.voice}
      />

      {/* Voice Catalog & Streaming Preview Modal */}
      <VoiceCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        currentVoiceId={voiceConfig.voice}
        onSelectVoice={(voiceId) => {
          setVoiceConfig((prev) => ({ ...prev, voice: voiceId, speakerId: 0 }));
          checkStatusAndVoices();
        }}
        onVoiceDownloaded={() => {
          checkStatusAndVoices();
        }}
      />
    </div>
  );
}
