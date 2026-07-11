// Ambient surface for the sibling @qinit/* packages the IDE imports. Vite resolves these to the real
// source (or the browser-core shim); tsc uses THESE declarations and never type-checks the cross-repo
// source. Keep in sync with what ./ide actually calls.

// Monaco ships its basic-language grammars as deep ESM entries with no bundled .d.ts. We import the cpp
// Monarch definition to clone + extend it (see ide/qpi/grammar.ts).
declare module "monaco-editor/esm/vs/basic-languages/cpp/cpp.js" {
  import type * as Monaco from "monaco-editor";
  export const conf: Monaco.languages.LanguageConfiguration;
  export const language: Monaco.languages.IMonarchLanguage;
}

declare module "@qinit/engine" {
  export interface EngineLogEvent {
    level: "debug" | "info" | "warn" | "error";
    tick: number;
    cat: string;
    msg: string;
  }
  export class VirtualNode {
    constructor(opts?: { slotBase?: number; slotCount?: number; consensus?: unknown; mempool?: boolean; verifySigs?: boolean; fees?: "off" | "metered"; defaultReserve?: bigint });
    // The chain-sim, exposed for epoch control (the tick path goes through advanceTick, which switches
    // epoch on a boundary via sim.advance).
    readonly sim: {
      epochN: number;
      epochLength: number;
      contracts: Map<number, { mem: WebAssembly.Memory; stateSize: number }>;
    };
    onLog?: ((e: EngineLogEvent) => void) | undefined;
    deploy(slot: number, wasm: Uint8Array, name?: string): unknown;
    querySmartContract(contractIndex: number, inputType: number, input: Uint8Array): Promise<Uint8Array>;
    broadcastTx(txBytes: Uint8Array): Promise<{ ok: boolean; transactionId?: string; code?: number; message?: string; moneyFlew?: boolean; queued?: boolean }>;
    txStatus(tick: number, txId: string): Promise<{ tick: number; currentTick: number; txId: string; found: boolean; moneyFlew: boolean; processed: boolean }>;
    advanceTick(n?: number): number;
    tickInfo(): Promise<{ tick: number; epoch: number }>;
    seedFaucet(amount?: bigint): Promise<void>;
    fundedSeed(): Promise<string | undefined>;
    balance(id: string): Promise<{ balance: string; [k: string]: unknown }>;
    fund(id: Uint8Array, amount: bigint): void;
    stateRead(slot: number, off: number, len: number): Promise<{ hex: string; off: number; len: number; stateSize: number }>;
    setDebug(on: boolean): Promise<{ enabled: boolean }>;
    debugTrace(): Promise<DebugTrace>;
    assetUniverse(): AssetSnapshot[];
  }
  export interface AssetSnapshot {
    issuer: string;
    name: string;
    decimals: number;
    unit: string;
    totalShares: string;
    holdings: { owner: string; possessor: string; ownMgmt: number; posMgmt: number; shares: string }[];
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

  export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
  }
  export function runCompiledGtest(program: unknown, runnerWasm: Uint8Array, contracts: Record<number, Uint8Array>): Promise<TestResult[]>;
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
  export function initK12(): Promise<void>;
  export function k12Sync(bytes: Uint8Array): Uint8Array;
}

declare module "@qinit/compile/browser" {
  export interface CompileDiagnostic {
    severity: "error" | "warning";
    message: string;
    span: { start: number; end: number; line: number; col: number };
    category?: "fidelity";
  }
  export interface MinimalIdlEntry {
    name: string;
    inputType: number;
    inSize: number;
    outSize: number;
  }
  export interface ContractIdl {
    name: string;
    slot: number;
    functions: MinimalIdlEntry[];
    procedures: MinimalIdlEntry[];
    stateSize: number;
    sysprocMask: number;
  }
  export interface CalleeIdl {
    name: string;
    index: number;
    functions: Record<string, { inputType: number; inSize: number; outSize: number }>;
    procedures: Record<string, { inputType: number; inSize: number; outSize: number }>;
  }
  export interface CompileResult {
    wasm: Uint8Array;
    diagnostics: CompileDiagnostic[];
    idl: ContractIdl;
    timings?: Record<string, number>;
  }
  export interface GtestProgram {
    version: 2;
    contract: string;
    mainSlot: number;
    runnerSlot: number;
    tests: Array<{ name: string; inputType: number }>;
  }
  export interface GtestCompileResult {
    wasm?: Uint8Array;
    program?: GtestProgram;
    diagnostics: CompileDiagnostic[];
    idl: ContractIdl;
  }
  export interface CompilerInfo {
    qinitVersion: string;
    coreCommit: string;
    snapshotHash: string;
    generatorVersion: number;
    protocolVersion: number;
  }
  export const COMPILER_PROTOCOL_VERSION: number;
  export const compilerInfo: CompilerInfo;
  export const qpiSnapshot: string;
  export function compileContract(opts: {
    source: string;
    name: string;
    slot: number;
    arenaSz?: number;
    callees?: CalleeIdl[];
    calleeSources?: Array<{ name: string; source: string }>;
    qpiHeader?: string;
    strict?: boolean;
    onPhase?: (phase: string) => void | Promise<void>;
  }): Promise<CompileResult>;
  export function compileGtest(opts: {
    source: string;
    testSource: string;
    name: string;
    slot: number;
    qpiHeader?: string;
  }): Promise<GtestCompileResult>;
}

declare module "@qinit/build/idl" {
  export interface Field {
    name: string;
    type: string;
    struct?: Field[];
    array?: boolean;
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
