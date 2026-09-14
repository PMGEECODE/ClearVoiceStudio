"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log sanitized error in development/telemetry without leaking to UI
    console.error("Studio application error caught by boundary:", error.message);
  }, [error]);

  return (
    <main
      role="alert"
      className="min-h-screen bg-[#0a0d14] text-slate-100 flex items-center justify-center p-6 selection:bg-emerald-500/30"
    >
      <div className="max-w-md w-full bg-[#111622] border border-slate-800/80 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-6 shadow-inner">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <h1 className="text-xl font-bold text-white mb-2 tracking-tight">
          Application Encountered an Error
        </h1>
        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          The voice studio encountered an unexpected state. Your local voice models and session data remain intact.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors border border-slate-700/60"
          >
            <Home className="w-4 h-4" />
            <span>Reload Studio</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
