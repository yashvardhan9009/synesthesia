import { spawn } from "node:child_process";
import path from "node:path";
import { root, venvPython } from "./venv.mjs";

const child = spawn(venvPython(), ["-m", "pytest", "-q"], {
  cwd: path.join(root, "backend"),
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
