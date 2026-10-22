import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const NEXT_PORT = process.env.NEXT_PORT ? parseInt(process.env.NEXT_PORT, 10) : 42840;

console.log("\x1b[36m%s\x1b[0m", "==================================================");
console.log("\x1b[36m%s\x1b[0m", "        ClearVoice Studio — Kokoro Engine         ");
console.log("\x1b[36m%s\x1b[0m", "==================================================");

const extraArgs = process.argv.slice(2);
const args = ["-p", String(NEXT_PORT), ...extraArgs];

console.log("\x1b[34m%s\x1b[0m", "[Studio] Launching studio application...");
const nextProcess = spawn("npx", ["next", "dev", ...args], {
  cwd: rootDir,
  stdio: "inherit",
  shell: true,
});

process.on("SIGINT", () => {
  nextProcess.kill("SIGTERM");
  process.exit(0);
});
process.on("SIGTERM", () => {
  nextProcess.kill("SIGTERM");
  process.exit(0);
});

nextProcess.on("exit", (code) => {
  process.exit(code || 0);
});
