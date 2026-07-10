import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The IDE reuses the qinit TS engine + codecs straight from the sibling monorepo source (dev path; the
// packages are private/unpublished). @qinit/core's package index pulls node-only modules (fetch.ts), so
// it's redirected to a browser-safe shim that re-exports only the browser-usable surface + an ESM K12.
//
// Compiler resolution (QINIT_SOURCE):
//   local   (default) — @qinit/compile/browser resolves to ${QINIT_LOCAL}/packages/compile/src/browser.ts
//             and the QPI header snapshot is generated from ${QINIT_CORE} before Vite starts (regenerated
//             on header edits while the dev server runs). Missing sibling checkouts are hard errors —
//             never a silent fallback to npm or the header stub.
//   package — the compiler source aliases are disabled and @qinit/compile/browser resolves to the
//             lockfile-pinned npm package (snapshot already embedded at release). Production builds set this.
const QINIT_SOURCE = process.env.QINIT_SOURCE === "package" ? "package" : "local";
const QINIT_LOCAL = process.env.QINIT_LOCAL ?? new URL("../../Qinit", import.meta.url).pathname;
const QINIT_CORE = process.env.QINIT_CORE ?? new URL("../../qubic-core-lite", import.meta.url).pathname;

const qinit = (rel: string) => `${QINIT_LOCAL}/packages/${rel}`;
const here = (rel: string) => new URL(rel, import.meta.url).pathname;

// Generate the QPI header snapshot the local compiler source embeds, and keep it fresh while the
// dev server runs. Package mode skips this entirely — the npm release ships it pre-embedded.
function qpiSnapshotPrep(): Plugin {
  const generator = qinit("compile/tools/gen-qpi-snapshot.ts");

  const generate = () => {
    if (!existsSync(qinit("compile/package.json"))) {
      throw new Error(`QINIT_SOURCE=local needs the sibling qinit monorepo at ${QINIT_LOCAL} (override with QINIT_LOCAL=<path>)`);
    }
    if (!existsSync(`${QINIT_CORE}/src/contracts/qpi.h`)) {
      throw new Error(`QINIT_SOURCE=local needs a core checkout at ${QINIT_CORE} (override with QINIT_CORE=<path>)`);
    }
    const r = spawnSync("bun", [generator, "--core", QINIT_CORE], { stdio: "inherit" });
    if (r.error || r.status !== 0) {
      throw new Error(`QPI snapshot generation failed${r.error ? ` — ${r.error.message}` : ""} (bun ${generator} --core ${QINIT_CORE})`);
    }
  };

  return {
    name: "qinit-qpi-snapshot-prep",
    buildStart() {
      generate();
    },
    configureServer(server) {
      const watcher = spawn("bun", [generator, "--core", QINIT_CORE, "--watch", "--quiet"], { stdio: "inherit" });
      server.httpServer?.on("close", () => watcher.kill());
    },
  };
}

const aliases: Record<string, string> = {
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
};
if (QINIT_SOURCE === "local") {
  // Subpath before package root — first match wins.
  aliases["@qinit/compile/browser"] = qinit("compile/src/browser.ts");
  aliases["@qinit/compile"] = qinit("compile/src/index.ts");
}

export default defineConfig({
  plugins: [react(), ...(QINIT_SOURCE === "local" ? [qpiSnapshotPrep()] : [])],
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
  optimizeDeps: { exclude: ["@qinit/engine", "@qinit/proto", "@qinit/build", "@qinit/core", "@qinit/compile"] },
});
