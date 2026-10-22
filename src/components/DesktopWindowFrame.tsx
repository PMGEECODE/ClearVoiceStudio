"use client";

import React, { useEffect, useState } from "react";

export const DesktopWindowFrame: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
      setIsDesktop(true);
      window.electronAPI.isMaximized?.().then((max) => setIsMaximized(Boolean(max)));
      const unsub = window.electronAPI.onMaximizedChange?.((max) => setIsMaximized(Boolean(max)));
      return () => unsub?.();
    }
  }, []);

  if (!isDesktop || isMaximized) return null;

  const handleResize = (direction: string) => (e: React.MouseEvent) => {
    if (e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      window.electronAPI?.startResizeDragging?.(direction);
    }
  };

  return (
    <div
      className="desktop-resize-frame pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden="true"
    >
      {/* 4 Edges */}
      <div
        className="pointer-events-auto absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize"
        onMouseDown={handleResize("North")}
      />
      <div
        className="pointer-events-auto absolute bottom-0 left-3 right-3 h-1.5 cursor-ns-resize"
        onMouseDown={handleResize("South")}
      />
      <div
        className="pointer-events-auto absolute left-0 top-3 bottom-3 w-1.5 cursor-ew-resize"
        onMouseDown={handleResize("West")}
      />
      <div
        className="pointer-events-auto absolute right-0 top-3 bottom-3 w-1.5 cursor-ew-resize"
        onMouseDown={handleResize("East")}
      />

      {/* 4 Corners */}
      <div
        className="pointer-events-auto absolute top-0 left-0 w-3 h-3 cursor-nwse-resize"
        onMouseDown={handleResize("NorthWest")}
      />
      <div
        className="pointer-events-auto absolute top-0 right-0 w-3 h-3 cursor-nesw-resize"
        onMouseDown={handleResize("NorthEast")}
      />
      <div
        className="pointer-events-auto absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize"
        onMouseDown={handleResize("SouthWest")}
      />
      <div
        className="pointer-events-auto absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
        onMouseDown={handleResize("SouthEast")}
      />
    </div>
  );
};
