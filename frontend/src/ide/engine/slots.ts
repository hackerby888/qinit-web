// deploy-slot bookkeeping for the shell's registry of deployed contracts: the next free dynamic slot, the
// lower-index rule for callees, and the callee sources a build needs.
import type { ContractIdlView as ContractIdl } from "../calls/idl-view";
import { contractFile } from "../workspace/workspace";
import { DEFAULT_WASM_SLOT_LAYOUT } from "@qinit/core";

// first dynamic slot; each distinct contract gets the next free one. The in-page node runs on the same default
// layout, so the shell's slot picks and the engine's window agree.
export const SLOT_BASE = DEFAULT_WASM_SLOT_LAYOUT.slotBase;

export type DeployedContract = { name: string; slot: number; address: string; idl: ContractIdl; source: string; wasm: Uint8Array; calls?: string[] };

// A 32-byte id as hex → bytes. Asset issuer/owner ids cross from the engine as hex; the panel needs raw bytes
// to tell a contract id apart from a wallet and to derive the Qubic identity.
export const hexToBytes = (hex: string): Uint8Array => {
  const n = (hex.length / 2) | 0;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

// A contract id is id(slot, 0, 0, 0): only the leading 8-byte slot index is non-zero. Returns the slot, or
// null for a real wallet identity.
export const contractSlotOf = (hex: string): number | null => {
  const b = hexToBytes(hex);
  for (let i = 8; i < 32; i++) {
    if (b[i] !== 0) {
      return null;
    }
  }
  return b.length >= 32 ? Number(new DataView(b.buffer).getBigUint64(0, true)) : null;
};

export const assignSlot = (reg: Record<string, DeployedContract>, name: string): number => {
  if (reg[name]) {
    return reg[name].slot;
  }
  const used = new Set(Object.values(reg).map((d) => d.slot));
  let s = SLOT_BASE;
  while (used.has(s)) {
    s++;
  }
  return s;
};

// First free slot at or above `floor`, reusing the contract's current slot when it already clears the floor.
// A caller must land above all its callees (the qubic lower-index rule), so floor = maxCalleeSlot + 1.
export const slotAtOrAbove = (reg: Record<string, DeployedContract>, name: string, floor: number): number => {
  const cur = reg[name]?.slot;
  if (cur !== undefined && cur >= floor) {
    return cur;
  }
  const used = new Set(Object.values(reg).map((d) => d.slot));
  let s = Math.max(SLOT_BASE, floor);
  while (used.has(s)) {
    s++;
  }
  return s;
};

// Inter-contract callee type names referenced by CALL/INVOKE_OTHER_CONTRACT(<Name>, …) in a source.
export const scanCallees = (src: string): string[] =>
  [...new Set([...src.matchAll(/(?:CALL|INVOKE)_OTHER_CONTRACT_\w+\s*\(\s*(\w+)/g)].map((m) => m[1]))];

// Resolve a source's callees to the source that defines them, for passing to the compiler. Prefer an open
// project file; else fall back to the source the in-page node stored when the callee was deployed — so a
// deployed-but-not-open callee still resolves (the same way `qinit deploy` pulls callees off the node registry).
// The slot is the deployed index when known, else a provisional ascending one — its value only affects the
// emitted index constants, so the contract compiles either way (used for live diagnostics before a deploy).
export const resolveCallees = (files: { name: string; source: string }[], reg: Record<string, DeployedContract>, src: string): { name: string; source: string; slot: number; file?: string }[] => {
  const out: { name: string; source: string; slot: number; file?: string }[] = [];
  let provisional = SLOT_BASE;
  for (const name of scanCallees(src)) {
    const file = contractFile(files, name);
    const source = file?.source ?? reg[name]?.source;
    if (!source) {
      continue; // unresolved — let the compiler report the missing callee type
    }
    out.push({ name, source, slot: reg[name]?.slot ?? provisional++, file: file?.name });
  }
  return out;
};
