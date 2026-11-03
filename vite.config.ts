/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    host: true,
    proxy: { "/api": "http://localhost:3000" },
  },
  test: {
    root: ".",
    include: ["src/**/*.test.ts"],
  },
});
