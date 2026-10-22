import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AcousticWaveBackground } from "@/components/AcousticWaveBackground";
import { DesktopWindowFrame } from "@/components/DesktopWindowFrame";

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
  authors: [{ name: "PMGEECODE", url: "https://github.com/PMGEECODE/ClearVoiceStudio" }],
  creator: "PMGEECODE",
  // ── Favicons & App Icons ──────────────────────────────────────────
  // Next.js reads these and injects the correct <link> tags into <head>.
  // All files are served from /public and referenced by their root-relative path.
  icons: {
    // Standard browser favicon (multi-size ICO covers 16/32/48)
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "256x256", type: "image/png" },
    ],
    // iOS home screen icon
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    // Explicit shortcut icon for legacy IE/Edge support
    shortcut: "/favicon.ico",
  },
  // PWA web manifest — also links icon-192 and icon-512
  manifest: "/site.webmanifest",
  // ── SEO ──────────────────────────────────────────────────────────
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
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "ClearVoice Studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClearVoice Studio | Local AI Neural Speech Synthesis",
    description:
      "Local AI TTS studio with real-time type-to-speak, multi-voice dialogue, and audio export.",
    images: ["/icon-512.png"],
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
        <DesktopWindowFrame />
        <AcousticWaveBackground />
        {children}
      </body>
    </html>
  );
}

