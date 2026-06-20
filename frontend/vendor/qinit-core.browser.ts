// Browser-safe stand-in for `@qinit/core` (the package index re-exports fetch.ts/backtrace.ts, which
// pull node:fs / child_process). The IDE only needs the browser-usable surface: identity, tx signing,
// rpc/net (fetch-based), and K12. Vite aliases `@qinit/core` to this file. The one rewrite vs upstream
// is K12: core resolves @qubic-lib's emscripten crypto via bun `require(...)`, which doesn't exist in
// the browser — here it's a normal ESM import.
//
// Relative paths reach the sibling monorepo source: vendor -> frontend -> Qinit-web -> Projects -> Qinit.
export { deriveIdentity, bytesToIdentity, identityToBytes, cryptoSmoke } from "../../../Qinit/packages/core/src/qubic";
export type { IdentityResult, CryptoSmokeResult } from "../../../Qinit/packages/core/src/qubic";

export { buildSignedTx, assertSeed, LITE_DEPLOY_ADDRESS } from "../../../Qinit/packages/core/src/tx";
export type { SignedTx, TxInput } from "../../../Qinit/packages/core/src/tx";

export { LiteRpc } from "../../../Qinit/packages/core/src/rpc";
export type {
  TickInfo, DynRegistry, DynContract, DynEntry, DynUpload,
  DebugTrace, DebugEntry, DebugHostCall, DebugStateRegion,
} from "../../../Qinit/packages/core/src/rpc";

export { broadcastTx, broadcastTxs, fetchT, readBody } from "../../../Qinit/packages/core/src/net";
export type { BroadcastResult } from "../../../Qinit/packages/core/src/net";

export type { NodeTransport, TxStatus, StateRead, EntityInfo, TxInfo } from "../../../Qinit/packages/core/src/transport";

// K12 (KangarooTwelve): ESM import of @qubic-lib's emscripten crypto (the same module core uses), so it
// runs in the page. The `default` export is a Promise that resolves (once the wasm runtime is ready) to
// { schnorrq, K12 } where K12(input, out, outLen) writes into `out`. k12Sync mirrors @qinit/core's
// signature exactly — `(bytes) => Uint8Array(32)` — which is what the engine's k12Bytes calls.
import cryptoModule from "@qubic-lib/qubic-ts-library/dist/crypto";

type RawK12 = (input: Uint8Array, out: Uint8Array, outLen: number) => void;
let _k12raw: RawK12 | null = null;

export async function initK12(): Promise<void> {
  if (_k12raw) {
    return;
  }

  const resolved = await ((cryptoModule as { default?: unknown }).default ?? cryptoModule);
  _k12raw = (resolved as { K12: RawK12 }).K12;
}

export function k12Sync(bytes: Uint8Array): Uint8Array {
  if (!_k12raw) {
    throw new Error("K12 not initialised — await initK12() first");
  }
  const out = new Uint8Array(32);
  _k12raw(bytes, out, 32);
  return out;
}
