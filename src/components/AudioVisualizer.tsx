"use client";

import React, { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  isPlaying: boolean;
  audioElement: HTMLAudioElement | null;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let phase = 0;
    const numBars = 48;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barWidth = width / numBars - 2;

      for (let i = 0; i < numBars; i++) {
        let barHeight = 6;
        if (isPlaying) {
          // Dynamic synthesized wave animation based on harmonic frequencies
          const sinVal1 = Math.sin(i * 0.25 + phase * 0.08);
          const sinVal2 = Math.cos(i * 0.45 - phase * 0.05);
          const centerBias = 1 - Math.abs(i - numBars / 2) / (numBars / 2);
          const dynamicHeight =
            (sinVal1 * 0.5 + sinVal2 * 0.5 + 1) * (height * 0.42) * centerBias + 6;
          barHeight = Math.max(6, Math.min(height - 4, dynamicHeight));
        }

        const x = i * (barWidth + 2);
        const y = (height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isPlaying) {
          gradient.addColorStop(0, "#5eead4");
          gradient.addColorStop(0.5, "#2dd4bf");
          gradient.addColorStop(1, "#06b6d4");
        } else {
          gradient.addColorStop(0, "rgba(255, 255, 255, 0.12)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 0.04)");
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }

      phase += isPlaying ? 1 : 0.2;
      animFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform-canvas"
      width={480}
      height={64}
    />
  );
};
