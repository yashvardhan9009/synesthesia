import { spawn } from "node:child_process";
import { root, venvPython, windows } from "./venv.mjs";

const children = [];

function run(command, args, { shell = false } = {}) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", shell });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) shutdown(code);
  });
}

function shutdown(code = 0) {
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run(venvPython(), [
  "-m",
  "uvicorn",
  "app.main:app",
  "--app-dir",
  "backend",
  "--host",
  "127.0.0.1",
  "--port",
  process.env.SYN_API_PORT ?? "8741",
]);

// pnpm is pnpm.cmd on Windows; the shell resolves that shim.
run(windows ? "pnpm.cmd" : "pnpm", ["--dir", "frontend", "dev"], { shell: windows });
