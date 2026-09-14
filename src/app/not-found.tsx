import React from "react";
import Link from "next/link";
import { Mic, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main
      role="main"
      className="min-h-screen bg-[#0a0d14] text-slate-100 flex items-center justify-center p-6 selection:bg-emerald-500/30"
    >
      <div className="max-w-md w-full bg-[#111622] border border-slate-800/80 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-6 shadow-inner">
          <Mic className="w-7 h-7" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
          404 — Page Not Found
        </h1>
        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          The requested route does not exist in ClearVoice Studio. Return to the main editor to continue speech synthesis.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-emerald-950/40"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Studio</span>
        </Link>
      </div>
    </main>
  );
}
