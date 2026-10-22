import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the synthesize/transcribe routes to use Node.js native modules
  // (child_process, fs) without them being bundled by webpack.
  serverExternalPackages: [
    "ffmpeg-static",
    "kokoro-js",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  outputFileTracingIncludes: {
    "/api/download-voice": ["./shared/secureDownload.mjs", "./shared/networkReachability.mjs"],
    "/api/convert-mp4": ["./node_modules/ffmpeg-static/**"],
  },

  // Desktop apps serve local assets directly; disable native sharp image optimization
  images: {
    unoptimized: true,
  },

  // Security: Do not expose production source maps
  productionBrowserSourceMaps: false,

  // Webpack configuration to handle ONNX Runtime properly
  webpack: (config, { isServer }) => {
    // In browser builds, exclude Node.js-specific ONNX runtime
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "onnxruntime-node$": false,
      };
    }
    return config;
  },

  // Empty turbopack config to silence webpack config warning during dev
  turbopack: {},

  // NOTE: The empty turbopack config above is ONLY to silence Next.js warnings.
  // Production builds MUST use webpack (via --webpack flag) to ensure stable
  // module resolution. Turbopack generates hashed module IDs that break in
  // Electron packaged apps.

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
          // NOTE: COOP/COEP (Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy)
          // are intentionally NOT set. Setting require-corp breaks cross-origin worker
          // importScripts and onnxruntime-web WASM fetches since jsDelivr and the
          // onnxruntime CDN do not serve Cross-Origin-Resource-Policy headers.
          // SharedArrayBuffer is not required because onnxruntime runs with numThreads=1.
        ],
      },
    ];
  },
};

export default nextConfig;

