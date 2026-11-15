import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const windows = process.platform === "win32";

/** Virtualenv interpreter. Windows uses Scripts\\python.exe, everywhere else bin/python. */
export function venvPython() {
  const candidate = windows
    ? path.join(root, "backend", ".venv", "Scripts", "python.exe")
    : path.join(root, "backend", ".venv", "bin", "python");
  if (!fs.existsSync(candidate)) {
    const shown = windows ? "backend\\.venv\\Scripts\\python.exe" : "backend/.venv/bin/python";
    console.error(`No virtualenv interpreter at ${shown}. Create it with the README steps, then run this again.`);
    process.exit(1);
  }
  return candidate;
}
