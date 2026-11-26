/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(rawId) {
          const id = rawId.replace(/\\/g, "/");
          if (!id.includes("node_modules")) return;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("/zustand/")
          ) {
            return "vendor-react";
          }
          if (
            id.includes("/@radix-ui/") ||
            id.includes("/lucide-react/") ||
            id.includes("/react-resizable-panels/") ||
            id.includes("/class-variance-authority/") ||
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/")
          ) {
            return "vendor-ui";
          }
          if (id.includes("/katex/")) {
            return "vendor-katex";
          }
          if (id.includes("/highlight.js/")) {
            return "vendor-hljs";
          }
          if (
            id.includes("/markdown-it/") ||
            id.includes("/dompurify/") ||
            id.includes("/turndown/") ||
            id.includes("/turndown-plugin-gfm/") ||
            id.includes("/js-yaml/")
          ) {
            return "vendor-markdown";
          }
          if (
            id.includes("/@lezer/common/") ||
            id.includes("/@lezer/highlight/") ||
            id.includes("/@lezer/lr/") ||
            id.includes("/@lezer/markdown/") ||
            id.includes("/@lezer/yaml/")
          ) {
            return "vendor-lezer";
          }
          if (
            id.includes("/@codemirror/view/") ||
            id.includes("/@codemirror/state/") ||
            id.includes("/@codemirror/commands/") ||
            id.includes("/@codemirror/language/") ||
            id.includes("/@codemirror/search/") ||
            id.includes("/@codemirror/autocomplete/") ||
            id.includes("/@codemirror/lang-markdown/") ||
            id.includes("/@codemirror/lang-yaml/")
          ) {
            return "vendor-codemirror";
          }
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
