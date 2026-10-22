"use client";

import React, { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";

interface AudioVisualizerProps {
  isPlaying: boolean;
  audioElement: HTMLAudioElement | null;
}

// Global WeakMap to ensure createMediaElementSource is called exactly once per HTMLAudioElement
const audioGraphMap = new WeakMap<
  HTMLAudioElement,
  { audioCtx: AudioContext; analyser: AnalyserNode }
>();

function getOrCreateAudioGraph(audioEl: HTMLAudioElement) {
  let graph = audioGraphMap.get(audioEl);
  if (!graph) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    const audioCtx = new AudioContextClass();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; // 128 frequency bins for precise spectral resolution
    analyser.smoothingTimeConstant = 0.82; // Silky-smooth responsive motion
    analyser.minDecibels = -90;
    analyser.maxDecibels = -12;

    try {
      const source = audioCtx.createMediaElementSource(audioEl);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      graph = { audioCtx, analyser };
      audioGraphMap.set(audioEl, graph);
    } catch (err) {
      console.warn("[AudioVisualizer] Failed to connect Web Audio API source node:", err);
      return null;
    }
  }
  return graph;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isPlaying,
  audioElement,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Peak hold data for broadcast meter physics
  const peaksRef = useRef<number[]>([]);
  const peakFalloffRef = useRef<number[]>([]);

  // Telemetry state for active pitch & level
  const [telemetry, setTelemetry] = useState<{ pitchHz: number; db: number }>({
    pitchHz: 0,
    db: -60,
  });

  // Ensure AudioContext is resumed whenever audio begins playing
  useEffect(() => {
    if (!audioElement) return;

    const resumeContext = () => {
      const graph = getOrCreateAudioGraph(audioElement);
      if (graph && graph.audioCtx.state === "suspended") {
        graph.audioCtx.resume().catch(() => {});
      }
    };

    audioElement.addEventListener("play", resumeContext);
    if (isPlaying) {
      resumeContext();
    }

    return () => {
      audioElement.removeEventListener("play", resumeContext);
    };
  }, [audioElement, isPlaying]);

  // Main visualizer animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const numBars = 48;

    // Initialize peak arrays
    if (peaksRef.current.length !== numBars) {
      peaksRef.current = new Array(numBars).fill(4);
      peakFalloffRef.current = new Array(numBars).fill(0);
    }

    let graph = audioElement ? getOrCreateAudioGraph(audioElement) : null;
    const freqData = graph ? new Uint8Array(graph.analyser.frequencyBinCount) : null;
    const timeData = graph ? new Uint8Array(graph.analyser.fftSize) : null;

    let restingPhase = 0;
    let telemetryThrottleCounter = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Attempt to retrieve fresh audio graph if not yet bound
      if (!graph && audioElement) {
        graph = getOrCreateAudioGraph(audioElement);
      }

      const hasLiveAudio = Boolean(
        isPlaying &&
        graph &&
        graph.audioCtx.state === "running" &&
        freqData &&
        timeData
      );

      let dominantPitch = 0;
      let currentRmsDb = -60;

      if (hasLiveAudio && graph && freqData && timeData) {
        graph.analyser.getByteFrequencyData(freqData);
        graph.analyser.getByteTimeDomainData(timeData);

        // Compute RMS dB
        let sumSq = 0;
        for (let t = 0; t < timeData.length; t++) {
          const norm = (timeData[t] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / timeData.length);
        currentRmsDb = rms > 0.001 ? Math.round(20 * Math.log10(rms)) : -60;

        // Detect dominant vocal pitch bin (search human fundamental range 80Hz - 600Hz)
        const binWidth = graph.audioCtx.sampleRate / graph.analyser.fftSize;
        let maxEnergy = 0;
        let peakBin = 0;
        const maxPitchBin = Math.min(freqData.length - 1, Math.floor(650 / binWidth));
        const minPitchBin = Math.max(1, Math.floor(75 / binWidth));

        for (let b = minPitchBin; b <= maxPitchBin; b++) {
          if (freqData[b] > maxEnergy) {
            maxEnergy = freqData[b];
            peakBin = b;
          }
        }
        if (maxEnergy > 28) {
          dominantPitch = Math.round(peakBin * binWidth);
        }
      }

      // Update telemetry display every ~6 frames for smooth reading
      telemetryThrottleCounter++;
      if (telemetryThrottleCounter % 6 === 0) {
        setTelemetry({
          pitchHz: dominantPitch,
          db: currentRmsDb,
        });
      }

      const barWidth = Math.max(2, (width / numBars) - 2.5);
      const binCount = freqData?.length || 128;

      for (let i = 0; i < numBars; i++) {
        let barHeight = 4; // Baseline resting height

        if (hasLiveAudio && freqData) {
          // Logarithmic distribution focusing on human speech vocal formants (100Hz - 4200Hz)
          const normIndex = i / (numBars - 1);
          // Curve biased towards low-mids
          const binIndex = Math.floor(1 + Math.pow(normIndex, 1.4) * (Math.min(binCount - 1, 56) - 1));
          const rawVal = freqData[Math.min(binIndex, binCount - 1)] || 0;

          // Normalize amplitude (0..1) with high dynamic range
          const amplitude = rawVal / 255;
          // Curve amplitude for punchy dynamics
          const shapedAmp = Math.pow(amplitude, 1.3);

          const maxBarHeight = height * 0.88;
          barHeight = Math.max(4, shapedAmp * maxBarHeight);
        } else if (isPlaying) {
          // Fallback smooth harmonic wave if WebAudio is waiting
          const sinVal = Math.sin(i * 0.3 + restingPhase * 0.12);
          const cosVal = Math.cos(i * 0.45 - restingPhase * 0.08);
          barHeight = Math.max(4, (sinVal * 0.5 + cosVal * 0.5 + 1) * (height * 0.32) + 4);
        } else {
          // Idle resting subtle pulse
          const subtleWave = Math.sin(i * 0.2 + restingPhase * 0.03) * 1.5;
          barHeight = Math.max(3, 4 + subtleWave);
        }

        // Peak hold calculation with gravity falloff
        if (barHeight >= peaksRef.current[i]) {
          peaksRef.current[i] = barHeight;
          peakFalloffRef.current[i] = 0;
        } else {
          peakFalloffRef.current[i] += 0.35;
          peaksRef.current[i] = Math.max(barHeight, peaksRef.current[i] - peakFalloffRef.current[i]);
        }

        const x = i * (barWidth + 2.5);
        // Symmetrical expansion from vertical center
        const y = (height - barHeight) / 2;

        // Custom Gradient: Electric teal -> Cyan -> Soft violet peaks
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (hasLiveAudio || isPlaying) {
          gradient.addColorStop(0, "#818cf8"); // Luminous lavender/violet top
          gradient.addColorStop(0.35, "#38bdf8"); // Electric cyan
          gradient.addColorStop(0.5, "#2dd4bf"); // Vibrant mint/teal center
          gradient.addColorStop(0.65, "#38bdf8");
          gradient.addColorStop(1, "#818cf8");
        } else {
          gradient.addColorStop(0, "rgba(255, 255, 255, 0.14)");
          gradient.addColorStop(0.5, "rgba(45, 212, 191, 0.1)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 0.06)");
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();

        // Render Peak Hold Indicator Cap
        if ((hasLiveAudio || isPlaying) && peaksRef.current[i] > 6) {
          const peakY = (height - peaksRef.current[i]) / 2;
          ctx.fillStyle = "#a5f3fc";
          ctx.beginPath();
          ctx.roundRect(x, peakY - 1, barWidth, 1.5, 1);
          ctx.fill();
        }
      }

      restingPhase += isPlaying ? 1 : 0.25;
      animFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isPlaying, audioElement]);

  // Handle High-DPI canvas resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "88px",
        borderRadius: "var(--radius-sm)",
        background: "rgba(10, 15, 26, 0.75)",
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />

      {/* Live Spectrum & Pitch Telemetry Overlay Badge */}
      <div
        style={{
          position: "absolute",
          top: "6px",
          right: "8px",
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          fontSize: "0.68rem",
          fontFamily: "monospace",
          fontWeight: 600,
          color: isPlaying ? "var(--accent-primary)" : "var(--text-dim)",
          background: isPlaying ? "rgba(13, 20, 36, 0.85)" : "rgba(10, 14, 23, 0.6)",
          padding: "0.15rem 0.45rem",
          borderRadius: "3px",
          border: `1px solid ${isPlaying ? "rgba(45, 212, 191, 0.3)" : "rgba(255, 255, 255, 0.06)"}`,
          pointerEvents: "none",
          transition: "var(--transition)",
          backdropFilter: "blur(4px)",
        }}
      >
        <Activity
          size={11}
          style={{
            color: isPlaying ? "var(--accent-primary)" : "var(--text-muted)",
            animation: isPlaying ? "spin 2s linear infinite" : "none",
          }}
        />
        <span>
          {isPlaying
            ? `${telemetry.pitchHz > 0 ? `${telemetry.pitchHz}Hz` : "SPECTRUM"} • ${telemetry.db > -55 ? `${telemetry.db}dB` : "ACTIVE"}`
            : "STANDBY"}
        </span>
      </div>
    </div>
  );
};
