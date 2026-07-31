import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The IDE reuses the qinit TS engine + codecs straight from the sibling monorepo source (dev path; the
// packages are private/unpublished). @qinit/core's package index pulls node-only modules (fetch.ts), so
// it's redirected to a browser-safe shim that re-exports only the browser-usable surface + an ESM K12.
//
// The browser compiler consumes the generated snapshot committed in the sibling Qinit checkout. No
// core-lite checkout is needed. A missing sibling checkout is a hard error, never a silent npm fallback.
const QINIT_LOCAL = process.env.QINIT_LOCAL ?? new URL("../../Qinit", import.meta.url).pathname;

const qinit = (rel: string) => `${QINIT_LOCAL}/packages/${rel}`;
const here = (rel: string) => new URL(rel, import.meta.url).pathname;

if (!existsSync(qinit("compiler/src/browser.ts"))) {
  throw new Error(`The browser compiler needs the sibling Qinit checkout at ${QINIT_LOCAL} (override with QINIT_LOCAL=<path>)`);
}

const aliases: Record<string, string> = {
  "@qinit/engine": qinit("engine/src/index.ts"),
  // Subpath imports must precede the package root (first match wins).
  "@qinit/proto/contract-idl": qinit("proto/src/contract-idl.ts"),
  "@qinit/proto/qpi-layout": qinit("proto/src/qpi-layout.ts"),
  "@qinit/proto": qinit("proto/src/index.ts"),
  // trace-format.ts imports the package root; keep that transitive edge on the browser-safe IDL module.
  "@qinit/build": qinit("build/src/idl.ts"),
  // The shared state/trace decoder (also used by the qinit CLI) — reused as-is, single source of truth.
  "@qinit/inspector": qinit("cli/src/trace-format.ts"),
  // The compiler's source-only ABI parser is browser-safe. Keep the subpath before the root alias.
  "@qinit/core/lite-abi-source": qinit("core/src/lite-abi-source.ts"),
  "@qinit/core": qinit("core/src/browser.ts"),
};
// Subpaths before the package root — first match wins.
aliases["@qinit/compiler/browser"] = qinit("compiler/src/browser.ts");
aliases["@qinit/compiler/analyzer"] = qinit("compiler/src/analyzer.ts");
aliases["@qinit/compiler"] = qinit("compiler/src/index.ts");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: aliases,
  },
  // The compile worker code-splits (wabt loads on demand) — the default iife worker format can't.
  worker: { format: "es" },
  server: {
    fs: { allow: [here("."), QINIT_LOCAL] },
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
  optimizeDeps: { exclude: ["@qinit/engine", "@qinit/proto", "@qinit/build", "@qinit/core", "@qinit/compiler"] },
});
