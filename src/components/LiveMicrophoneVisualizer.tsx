"use client";

import React, { useEffect, useRef, useState } from "react";

interface LiveMicrophoneVisualizerProps {
  isRecording: boolean;
  isMuted: boolean;
  isBusy: boolean;
}

export const LiveMicrophoneVisualizer: React.FC<LiveMicrophoneVisualizerProps> = ({
  isRecording,
  isMuted,
  isBusy,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [hasVoiceActivity, setHasVoiceActivity] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;

    // Only listen to microphone stream when recording is actively unmuted
    if (!isRecording || isMuted || isBusy) {
      // Clean up any active stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      setHasVoiceActivity(false);
      return;
    }

    const initMicrophone = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;

        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        
        if (!AudioContextClass) return;

        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.65;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
      } catch (err) {
        console.warn("[LiveMicrophoneVisualizer] Microphone stream visualizer unavailable:", err);
      }
    };

    initMicrophone();

    return () => {
      isCancelled = true;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      analyserRef.current = null;
    };
  }, [isRecording, isMuted, isBusy]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const numBars = 20;
    const barHeights = new Float32Array(numBars).fill(3);

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      let maxVolume = 0;

      if (analyserRef.current && isRecording && !isMuted && !isBusy) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Group frequency spectrum across numBars
        const step = Math.max(1, Math.floor(bufferLength / numBars));
        for (let i = 0; i < numBars; i++) {
          let sum = 0;
          const start = i * step;
          for (let j = 0; j < step && start + j < bufferLength; j++) {
            sum += dataArray[start + j];
          }
          const avg = sum / step;
          const targetHeight = Math.max(3, (avg / 255) * (height - 2));
          // Smooth interpolation for fluid reaction
          barHeights[i] = barHeights[i] * 0.4 + targetHeight * 0.6;
          if (avg > maxVolume) maxVolume = avg;
        }

        const active = maxVolume > 20;
        setHasVoiceActivity(active);
      } else if (isBusy) {
        // Subtle rhythmic processing indicator when transcribing
        const now = Date.now() / 150;
        for (let i = 0; i < numBars; i++) {
          const wave = (Math.sin(now + i * 0.4) + 1) * 0.5;
          barHeights[i] = 3 + wave * (height * 0.5);
        }
      } else {
        // Idle/muted baseline resting line
        for (let i = 0; i < numBars; i++) {
          barHeights[i] = Math.max(3, barHeights[i] * 0.7);
        }
      }

      // Draw bars with rounded corners and sound-reactive gradient
      const totalSpacing = (numBars - 1) * 3;
      const barWidth = Math.max(2.5, (width - totalSpacing) / numBars);

      for (let i = 0; i < numBars; i++) {
        const h = Math.min(height, Math.max(3, barHeights[i]));
        const x = i * (barWidth + 3);
        const y = height - h;

        const grad = ctx.createLinearGradient(0, y, 0, height);
        if (isMuted) {
          grad.addColorStop(0, "rgba(245, 158, 11, 0.7)");
          grad.addColorStop(1, "rgba(245, 158, 11, 0.2)");
        } else if (isBusy) {
          grad.addColorStop(0, "#34d399");
          grad.addColorStop(1, "#059669");
        } else if (hasVoiceActivity) {
          grad.addColorStop(0, "#38bdf8");
          grad.addColorStop(0.5, "#2dd4bf");
          grad.addColorStop(1, "#0d9488");
        } else {
          grad.addColorStop(0, "rgba(45, 212, 191, 0.45)");
          grad.addColorStop(1, "rgba(45, 212, 191, 0.15)");
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, h, 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isRecording, isMuted, isBusy, hasVoiceActivity]);

  return (
    <div
      className="live-mic-visualizer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        marginTop: "0.55rem",
      }}
      aria-label="Microphone live voice level"
    >
      <canvas
        ref={canvasRef}
        width={180}
        height={22}
        style={{
          display: "block",
          height: "22px",
          width: "180px",
          borderRadius: "4px",
        }}
      />
      {isRecording && !isMuted && !isBusy && (
        <span
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            color: hasVoiceActivity ? "var(--accent-primary)" : "var(--text-dim)",
            transition: "color 0.15s ease",
            letterSpacing: "0.02em",
          }}
        >
          {hasVoiceActivity ? "Voice detected" : "Listening for voice..."}
        </span>
      )}
      {isMuted && (
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--accent-amber)" }}>
          Microphone paused
        </span>
      )}
      {isBusy && (
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--accent-emerald)" }}>
          Transcribing recording...
        </span>
      )}
    </div>
  );
};
