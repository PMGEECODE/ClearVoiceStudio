import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AcousticWaveBackground } from "@/components/AcousticWaveBackground";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#061a24",
};

export const metadata: Metadata = {
  title: {
    default: "ClearVoice Studio | Local AI Neural Speech Synthesis",
    template: "%s | ClearVoice Studio",
  },
  description:
    "ClearVoice Studio — a local AI TTS studio with real-time type-to-speak, script upload, multi-voice dialogue, waveform playback, and audio/video export powered by neural speech synthesis.",
  applicationName: "ClearVoice Studio",
  keywords: [
    "ClearVoice",
    "text-to-speech",
    "neural speech synthesis",
    "local AI TTS",
    "voice studio",
    "dialogue generator",
  ],
  authors: [{ name: "LiveCodeTech", url: "https://github.com/livecodetech/piper-tts-studio" }],
  creator: "LiveCodeTech",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "ClearVoice Studio",
    title: "ClearVoice Studio | Local AI Neural Speech Synthesis",
    description:
      "Local AI TTS studio with real-time type-to-speak, multi-voice dialogue, waveform playback, and audio export.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ClearVoice Studio | Local AI Neural Speech Synthesis",
    description:
      "Local AI TTS studio with real-time type-to-speak, multi-voice dialogue, and audio export.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className="bg-[#061a24] text-slate-100 antialiased min-h-screen">
        <AcousticWaveBackground />
        {children}
      </body>
    </html>
  );
}

