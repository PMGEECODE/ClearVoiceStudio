"use client";

import React, { useMemo } from "react";

export const AcousticWaveBackground: React.FC = () => {
  // Generate primary acoustic ribbon wave paths (flowing resonant contours)
  const primaryRibbonPaths = useMemo(() => {
    const paths: { d: string; opacity: number }[] = [];
    const count = 38;

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);

      // ── Parametric points (same as before) ──────────────────
      const x0  = 60 + t * 260;
      const y0  = 80 + Math.sin(t * Math.PI) * 70;

      const cx1 = 380 + t * 240;
      const cy1 = -30 + t * 150;

      const cx2 = 820 + Math.cos(t * Math.PI) * 140;
      const cy2 = 110 + t * 260;

      const x1  = 980 - t * 140;
      const y1  = 290 + Math.sin(t * Math.PI * 1.25) * 130;

      // Expand S → explicit C (reflect cx2/cy2 through x1/y1)
      const rx4 = 2 * x1 - cx2;
      const ry4 = 2 * y1 - cy2;

      const cx3 = 580 - t * 300;
      const cy3 = 580 + t * 220;

      // Endpoint (bottom-left corner area — this becomes the NEW START)
      const x2  = 80 - t * 120;
      const y2  = 840 + Math.cos(t * Math.PI) * 50;

      // ── REVERSED path: M (x2,y2) → (x0,y0) ─────────────────
      // Same curves, traversed from bottom-left corner outward
      const d = `M ${x2.toFixed(1)} ${y2.toFixed(1)} C ${cx3.toFixed(1)} ${cy3.toFixed(1)}, ${rx4.toFixed(1)} ${ry4.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${x0.toFixed(1)} ${y0.toFixed(1)}`;

      // Calculate smooth bell-curve opacity
      const opacity = Number((0.12 + Math.sin(t * Math.PI) * 0.22).toFixed(3));
      paths.push({ d, opacity });
    }

    return paths;
  }, []);

  // Secondary subtle lower resonance wave
  const secondaryWavePaths = useMemo(() => {
    const paths: { d: string; opacity: number }[] = [];
    const count = 22;

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x0 = 300 + t * 300;
      const y0 = 620 + Math.sin(t * Math.PI) * 40;

      const cx1 = 680 + t * 200;
      const cy1 = 540 + t * 80;

      const cx2 = 1150 - t * 120;
      const cy2 = 640 + Math.cos(t * Math.PI) * 90;

      const x1 = 1380 - t * 160;
      const y1 = 780 + t * 60;

      const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      const opacity = Number((0.08 + Math.sin(t * Math.PI) * 0.14).toFixed(3));
      paths.push({ d, opacity });
    }

    return paths;
  }, []);

  return (
    <div
      className="acoustic-wave-canvas"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      >
        <defs>
          <linearGradient id="acoustic-gradient-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#2dd4bf" stopOpacity="0.8" />
            <stop offset="50%"  stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.6" />
          </linearGradient>

          <linearGradient id="acoustic-gradient-teal" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#06b6d4" stopOpacity="0.7" />
            <stop offset="60%"  stopColor="#2dd4bf" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.5" />
          </linearGradient>

          <filter id="acoustic-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Primary Flowing Ribbon Mesh */}
        <g className="acoustic-ribbon-group" filter="url(#acoustic-glow)">
          {primaryRibbonPaths.map((p, idx) => (
            <path
              key={`primary-${idx}`}
              d={p.d}
              fill="none"
              stroke="url(#acoustic-gradient-cyan)"
              strokeWidth={1.1}
              strokeOpacity={p.opacity}
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* Secondary Harmonized Resonance Lines */}
        <g className="acoustic-secondary-group">
          {secondaryWavePaths.map((p, idx) => (
            <path
              key={`secondary-${idx}`}
              d={p.d}
              fill="none"
              stroke="url(#acoustic-gradient-teal)"
              strokeWidth={0.9}
              strokeOpacity={p.opacity}
              strokeLinecap="round"
            />
          ))}
        </g>
      </svg>
    </div>
  );
};
