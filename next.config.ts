import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allow the synthesize/transcribe routes to use Node.js native modules
  // (child_process, fs) without them being bundled by Webpack/Turbopack.
  serverExternalPackages: ["piper-tts"],

  // Expose the Piper server URL to the Next.js API routes
  // (falls back to localhost:5000 if not set in the environment).
  env: {
    PIPER_SERVER_URL: process.env.PIPER_SERVER_URL ?? "http://127.0.0.1:5000",
  },

  // Security: Do not expose production source maps
  productionBrowserSourceMaps: false,

  // Turbopack workspace root resolution
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Production security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

