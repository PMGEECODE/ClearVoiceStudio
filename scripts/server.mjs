import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = process.env.APP_DIR || path.resolve(__dirname, "..");
const port = parseInt(process.env.PORT || process.env.NEXT_PORT || "42840", 10);
const host = "127.0.0.1";

console.log(`[Next.js Server] Initializing Next.js from: ${appDir} on ${host}:${port}`);

// Dynamically import next from the app directory
let next;
try {
  const nextModule = await import("next");
  next = nextModule.default || nextModule;
} catch (err) {
  console.error(`[Next.js Server] Failed to import next: ${err.message}`);
  process.exit(1);
}

const nextApp = next({
  dev: false,
  dir: appDir,
});

const handle = nextApp.getRequestHandler();

try {
  await nextApp.prepare();
  const server = http.createServer((req, res) => handle(req, res));

  server.on("error", (err) => {
    console.error(`[Next.js Server] Server error: ${err.message}`);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`[Next.js Server] ✓ ClearVoice Studio web service ready at http://${host}:${port}`);
  });

  const shutdown = () => {
    console.log("[Next.js Server] Graceful shutdown initiated...");
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (err) {
  console.error(`[Next.js Server] Failed to start server: ${err.message}`);
  process.exit(1);
}
