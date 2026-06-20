// Ambient surface for the sibling @qinit/* packages the IDE imports. Vite resolves these to the real
// source (or the browser-core shim); tsc uses THESE declarations and never type-checks the cross-repo
// source. Keep in sync with what ./ide actually calls.

declare module "@qinit/engine" {
  export class InProcessEngine {
    constructor(opts?: { slotBase?: number; slotCount?: number });
    deploy(slot: number, wasm: Uint8Array, name?: string): unknown;
    querySmartContract(contractIndex: number, inputType: number, input: Uint8Array): Promise<Uint8Array>;
    broadcastTx(txBytes: Uint8Array): Promise<{ moneyFlew?: boolean; [k: string]: unknown }>;
    advanceTick(n?: number): number;
    tickInfo(): Promise<{ tick: number; epoch: number }>;
    seedFaucet(amount?: bigint): Promise<void>;
    fundedSeed(): Promise<string | undefined>;
    balance(id: string): Promise<{ balance: string; [k: string]: unknown }>;
    fund(id: Uint8Array, amount: bigint): void;
    stateRead(slot: number, off: number, len: number): Promise<{ hex: string; off: number; len: number; stateSize: number }>;
    setDebug(on: boolean): Promise<{ enabled: boolean }>;
    debugTrace(): Promise<DebugTrace>;
  }
  export interface DebugEntry {
    seq: number;
    tick: number;
    index: number;
    entry: number;
    kind: number;
    ok: boolean;
    inHex: string;
    outHex: string;
    invocator: string;
    stateDiff: { off: number; before: string; after: string }[];
    logs: { type: number; size: number; hex: string }[];
    hostCalls: { name: string; detail: string }[];
  }
  export interface DebugTrace {
    enabled: boolean;
    entries: DebugEntry[];
  }
  export function initK12(): Promise<void>;
}

declare module "@qinit/inspector" {
  export interface Container {
    kind: "hashmap" | "hashset" | "collection";
    keyFmt: string;
    valFmt?: string;
    capacity: number;
  }
  export interface StateField {
    name: string;
    off: number;
    size: number;
    type: string;
    container?: Container;
    bad?: boolean;
  }
  export interface ColView {
    name: string;
    entries: string[];
  }
  export interface StateDump {
    fields: { name: string; value: string }[];
    cols: ColView[];
  }
  export interface TraceView {
    inDecoded: string;
    outDecoded: string;
    caller: string;
    fields: StateField[];
    cols: ColView[];
    logs: unknown[];
  }
  export interface StateReader {
    stateRead(slot: number, off: number, len: number): Promise<{ hex: string }>;
  }
  export function readState(rpc: StateReader, idx: number, source: string, name: string, full?: boolean): Promise<StateDump>;
  export function describeTrace(e: unknown, source: string | undefined, name: string, rpc: StateReader): Promise<TraceView>;
  export function stateFieldsOf(idl: unknown): StateField[];
  export function labelOff(fields: StateField[], off: number): string;
  export function fmtDiffVal(fields: StateField[], off: number, hex: string): string;
  export function fmtLog(l: unknown): string;
}

declare module "@qinit/proto" {
  export function encodeInput(fmt: string): Promise<Uint8Array>;
  export function encodeInputJson(fields: { name: string; type: string }[], json: unknown): Promise<Uint8Array>;
  export function decodeOutput(bytes: Uint8Array, fmt: string): Promise<unknown>;
  export function contractAddress(contractIndex: number): Uint8Array;
}

declare module "@qinit/core" {
  export interface TxInput {
    destination?: string | Uint8Array;
    amount?: number;
    tick: number;
    inputType: number;
    payload: Uint8Array;
  }
  export interface SignedTx {
    bytes: Uint8Array;
    id: string;
  }
  export function buildSignedTx(seed: string, t: TxInput): Promise<SignedTx>;
  export function deriveIdentity(seed: string): Promise<{ identity: string; publicKeyHex: string }>;
  export function identityToBytes(id: string): Uint8Array;
  export function bytesToIdentity(bytes: Uint8Array): Promise<string>;
}

declare module "@qinit/build/idl" {
  export interface Field {
    name: string;
    type: string;
  }
  export interface IdlEntry {
    name: string;
    in: string;
    out?: string;
    inFields: Field[];
    outFields?: Field[];
  }
  export interface ContractIdl {
    name: string;
    functions: Record<string, IdlEntry>;
    procedures: Record<string, IdlEntry>;
    state?: Field[];
  }
  export function extractIdl(source: string, name: string): ContractIdl;
}
