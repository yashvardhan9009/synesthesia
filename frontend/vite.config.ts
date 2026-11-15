import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.SYN_WEB_PORT ?? 4317),
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.SYN_API_PORT ?? 8741}`,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
