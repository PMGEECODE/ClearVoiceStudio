"use client";

import React from "react";
import { History, Play, Download, Trash2, ArrowUpRight } from "lucide-react";

export interface GenerationHistoryItem {
  id: string;
  text: string;
  voice: string;
  timestamp: number;
  audioBlobUrl: string;
}

interface HistoryDrawerProps {
  history: GenerationHistoryItem[];
  onPlayItem: (item: GenerationHistoryItem) => void;
  onLoadText: (text: string) => void;
  onClearHistory: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  history,
  onPlayItem,
  onLoadText,
  onClearHistory,
}) => {
  if (history.length === 0) {
    return null;
  }

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const handleDownload = (item: GenerationHistoryItem) => {
    const a = document.createElement("a");
    a.href = item.audioBlobUrl;
    a.download = `clearvoice_${item.id}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="glass-card history-section">
      <div className="card-header">
        <div className="card-title-group">
          <History size={16} style={{ color: "var(--accent-secondary)" }} />
          <div>
            <h3 className="card-title" style={{ fontSize: "0.95rem" }}>
              Session Generations ({history.length})
            </h3>
          </div>
        </div>

        <button
          type="button"
          className="icon-btn-ghost"
          onClick={onClearHistory}
          title="Clear session audio history"
        >
          <Trash2 size={13} />
          <span>Clear</span>
        </button>
      </div>

      <div className="card-body" style={{ padding: "0.85rem" }}>
        <div className="history-list">
          {history.map((item) => (
            <div key={item.id} className="history-item">
              <div className="history-info">
                <span className="history-text" title={item.text}>
                  {item.text}
                </span>
                <span className="history-meta">
                  {item.voice} • {formatTimestamp(item.timestamp)}
                </span>
              </div>

              <div className="history-actions">
                <button
                  type="button"
                  className="btn-icon-round"
                  style={{ width: 28, height: 28 }}
                  onClick={() => onPlayItem(item)}
                  title="Play audio"
                >
                  <Play size={13} style={{ marginLeft: 1 }} />
                </button>

                <button
                  type="button"
                  className="btn-icon-round"
                  style={{ width: 28, height: 28 }}
                  onClick={() => handleDownload(item)}
                  title="Download WAV"
                >
                  <Download size={13} />
                </button>

                <button
                  type="button"
                  className="btn-icon-round"
                  style={{ width: 28, height: 28 }}
                  onClick={() => onLoadText(item.text)}
                  title="Load into editor"
                >
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
