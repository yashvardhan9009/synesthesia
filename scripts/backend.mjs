import { spawn } from "node:child_process";
import { root, venvPython } from "./venv.mjs";

const child = spawn(
  venvPython(),
  ["-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", process.env.SYN_API_PORT ?? "8741"],
  { cwd: root, stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGTERM"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
