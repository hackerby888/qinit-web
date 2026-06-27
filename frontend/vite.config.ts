import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The IDE reuses the qinit TS engine + codecs straight from the sibling monorepo source (dev path; the
// packages are private/unpublished). @qinit/core's package index pulls node-only modules (fetch.ts), so
// it's redirected to a browser-safe shim that re-exports only the browser-usable surface + an ESM K12.
const qinit = (rel: string) => new URL(`../../Qinit/packages/${rel}`, import.meta.url).pathname;
const here = (rel: string) => new URL(rel, import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@qinit/engine": qinit("engine/src/index.ts"),
      // Subpath imports must precede the package root (first match wins). idl.ts pulls the shared QPI
      // container layouts from @qinit/proto/qpi-layout.
      "@qinit/proto/qpi-layout": qinit("proto/src/qpi-layout.ts"),
      "@qinit/proto": qinit("proto/src/index.ts"),
      // `@qinit/build/idl` must precede `@qinit/build` (first match wins). The package root pulls node:fs,
      // so it's redirected to the browser-safe idl module (which is all the inspector needs: extractIdl).
      "@qinit/build/idl": qinit("build/src/idl.ts"),
      "@qinit/build": qinit("build/src/idl.ts"),
      // The shared state/trace decoder (also used by the qinit CLI) — reused as-is, single source of truth.
      "@qinit/inspector": qinit("cli/src/trace-format.ts"),
      "@qinit/core": qinit("core/src/browser.ts"),
    },
  },
  server: {
    fs: { allow: [here("."), new URL("../../Qinit", import.meta.url).pathname] },
    proxy: {
      "/api": "http://127.0.0.1:8787", // dev: forward API to the backend (127.0.0.1, not localhost -> avoids IPv6 ::1 miss)
      "/collab": { target: "http://127.0.0.1:8787", ws: true, changeOrigin: true }, // collab WebSocket upgrade
    },
  },
  preview: {
    proxy: {
      "/api": "http://127.0.0.1:8787", // same forward for `vite preview` (prod-bundle check)
      "/collab": { target: "http://127.0.0.1:8787", ws: true, changeOrigin: true },
    },
  },
  optimizeDeps: { exclude: ["@qinit/engine", "@qinit/proto", "@qinit/build", "@qinit/core"] },
});
