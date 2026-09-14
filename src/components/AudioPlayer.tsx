"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Check,
  Disc,
  Video,
  FileAudio,
  Loader2,
} from "lucide-react";
import { AudioVisualizer } from "./AudioVisualizer";

interface AudioPlayerProps {
  audioUrl: string | null;
  textSnippet?: string;
  voiceName?: string;
  autoPlay?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  textSnippet = "Synthesized speech",
  voiceName = "AI Voice",
  autoPlay = true,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [downloadedFormat, setDownloadedFormat] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [conversionError, setConversionError] = useState<string | null>(null);

  // When a new audio URL arrives, load and optionally autoplay
  useEffect(() => {
    if (!audioUrl) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = audioUrl;
      audioRef.current.load();

      if (autoPlay) {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setIsPlaying(false);
          });
      }
    }
  }, [audioUrl, autoPlay]);

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleReplay = () => {
    if (!audioRef.current || !audioUrl) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().then(() => setIsPlaying(true));
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration || 0);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || !audioRef.current || !duration) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const clickPos = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, clickPos * duration));
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    audioRef.current.muted = nextMute;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      if (val === 0) {
        setIsMuted(true);
      } else if (isMuted) {
        setIsMuted(false);
        audioRef.current.muted = false;
      }
    }
  };

  // Direct WAV Download
  const handleDownloadWav = () => {
    if (!audioUrl) return;
    const sanitizedTitle = textSnippet
      .trim()
      .slice(0, 24)
      .replace(/[^a-zA-Z0-9]/g, "_")
      .toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `clearvoice_${sanitizedTitle || "speech"}_${timestamp}.wav`;

    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setDownloadedFormat("wav");
    setTimeout(() => setDownloadedFormat(null), 2500);
  };

  // FFmpeg download for compressed MP3 audio or visual MP4 video.
  const handleConvertDownload = async (mode: "audio" | "video") => {
    if (!audioUrl) return;
    setIsConverting(true);
    setConversionError(null);

    try {
      // 1. Fetch the active audio WAV blob
      const blobRes = await fetch(audioUrl);
      const wavBlob = await blobRes.blob();

      // 2. Post to FFmpeg conversion endpoint
      const res = await fetch(`/api/convert-mp4?mode=${mode}`, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wavBlob,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `FFmpeg conversion failed (${res.status})`);
      }

      const convertedBlob = await res.blob();
      const convertedUrl = URL.createObjectURL(convertedBlob);

      const sanitizedTitle = textSnippet
        .trim()
        .slice(0, 24)
        .replace(/[^a-zA-Z0-9]/g, "_")
        .toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const suffix = mode === "video" ? "_video.mp4" : ".mp3";
      const fileName = `clearvoice_${sanitizedTitle || "speech"}_${timestamp}${suffix}`;

      const a = document.createElement("a");
      a.href = convertedUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(convertedUrl);

      setDownloadedFormat(mode === "video" ? "mp4_video" : "mp3_audio");
      setTimeout(() => setDownloadedFormat(null), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to convert audio";
      setConversionError(msg);
    } finally {
      setIsConverting(false);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? "0" : ""}${remainingSecs}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="glass-card">
      <div className="card-header">
        <div className="card-title-group">
          <Disc size={18} style={{ color: "var(--accent-primary)" }} />
          <div>
            <h3 className="card-title">Audio Player & Export</h3>
            <p className="card-desc">
              Preview speech and export in WAV, MP3, or MP4 video • {voiceName}
            </p>
          </div>
        </div>
      </div>

      <div className="card-body">
        {/* Hidden Audio Element */}
        <audio
          ref={(el) => {
            audioRef.current = el;
            if (audioEl !== el) {
              setAudioEl(el);
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />

        {/* Waveform Display Box */}
        <div className="player-display">
          <AudioVisualizer
            isPlaying={isPlaying}
            audioElement={audioEl}
          />

          {/* Scrubber Timeline */}
          <div
            ref={scrubberRef}
            className="scrubber-bar"
            onClick={handleScrubberClick}
          >
            <div
              className="scrubber-fill"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="scrubber-thumb" />
            </div>
          </div>

          {/* Controls Row */}
          <div className="player-controls-row">
            <div className="player-main-btns">
              <button
                type="button"
                className="btn-play-circle"
                onClick={togglePlay}
                disabled={!audioUrl}
                suppressHydrationWarning
                style={{ opacity: audioUrl ? 1 : 0.4 }}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
              </button>

              <button
                type="button"
                className="btn-icon-round"
                onClick={handleReplay}
                disabled={!audioUrl}
                suppressHydrationWarning
                title="Restart"
              >
                <RotateCcw size={15} />
              </button>

              <div className="time-counter">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            {/* Volume control */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn-icon-round"
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={15} />
                ) : (
                  <Volume2 size={15} />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                style={{ width: "65px", accentColor: "var(--accent-primary)" }}
              />
            </div>
          </div>
        </div>

        {conversionError && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              background: "rgba(244, 63, 94, 0.15)",
              color: "var(--accent-rose)",
              fontSize: "0.8rem",
              marginBottom: "0.75rem",
            }}
          >
            {conversionError}
          </div>
        )}

        {/* Multi-Format Download Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {/* Primary WAV Download */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn-download"
              onClick={handleDownloadWav}
              disabled={!audioUrl || isConverting}
              suppressHydrationWarning
              style={{ flex: 1 }}
              title="Download uncompressed studio WAV audio"
            >
              {downloadedFormat === "wav" ? (
                <>
                  <Check size={16} />
                  <span>Downloaded WAV!</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Download WAV</span>
                </>
              )}
            </button>

            {/* MP3 Audio Download */}
            <button
              type="button"
              className="btn-download"
              onClick={() => handleConvertDownload("audio")}
              disabled={!audioUrl || isConverting}
              suppressHydrationWarning
              style={{
                flex: 1,
                background: "var(--accent-primary-light)",
                color: "var(--accent-primary)",
                border: "1px solid var(--border-active)",
              }}
              title="Convert to MP3 audio using FFmpeg"
            >
              {isConverting ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Converting...</span>
                </>
              ) : downloadedFormat === "mp3_audio" ? (
                <>
                  <Check size={16} />
                  <span>Downloaded MP3!</span>
                </>
              ) : (
                <>
                  <FileAudio size={16} />
                  <span>Download MP3</span>
                </>
              )}
            </button>
          </div>

          {/* MP4 Video (Soundwave Visualization) Download */}
          <button
            type="button"
            className="btn-download"
            onClick={() => handleConvertDownload("video")}
            disabled={!audioUrl || isConverting}
            suppressHydrationWarning
            style={{
              width: "100%",
              background: "rgba(168, 85, 247, 0.12)",
              color: "var(--accent-secondary)",
              border: "1px solid rgba(168, 85, 247, 0.3)",
            }}
            title="Render 1080p MP4 video with animated soundwave visualizer via FFmpeg"
          >
            {isConverting ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>Rendering Video with FFmpeg...</span>
              </>
            ) : downloadedFormat === "mp4_video" ? (
              <>
                <Check size={16} />
                <span>Downloaded MP4 Video!</span>
              </>
            ) : (
              <>
                <Video size={16} />
                <span>Download MP4 Video (With Soundwave)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
