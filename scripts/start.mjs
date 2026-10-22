import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

console.log("\x1b[34m%s\x1b[0m", "[Studio] Starting application service...");

const extraArgs = process.argv.slice(2);
if (process.env.PORT && !extraArgs.includes("-p") && !extraArgs.includes("--port")) {
  extraArgs.push("-p", process.env.PORT);
}

const nextProcess = spawn("npx", ["next", "start", ...extraArgs], {
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
