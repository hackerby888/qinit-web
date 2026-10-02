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
  export const DEFAULT_EPOCH_LENGTH: number;
  export interface EngineLogEvent {
    level: "debug" | "info" | "warn" | "error";
    tick: number;
    cat: string;
    msg: string;
  }
  export class VirtualNode {
    constructor(opts?: { slotBase?: number; slotCount?: number; consensus?: unknown; mempool?: boolean; verifySigs?: boolean; fees?: "off" | "metered"; defaultReserve?: bigint; liteTicking?: boolean; epochLength?: number });
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
    tickInfo(): Promise<{ tick: number; epoch: number; fault?: import("@qinit/core").EngineFaultInfo }>;
    faultInfo(): Promise<import("@qinit/core").EngineFaultInfo | null>;
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
}

declare module "@qinit/inspector/state-format" {
  export interface StateLine {
    label: string;
    text: string;
    filled: boolean;
  }
  export function jsonText(value: unknown): string;
}

declare module "@qinit/inspector/state-read" {
  import type { StateLine } from "@qinit/inspector/state-format";
  export interface StateContainer {
    index: number;
    name: string;
    kind: "array" | "bitarray" | "hashmap" | "hashset" | "collection" | "linkedlist";
    size: number;
    status: "collapsed" | "loading" | "loaded" | "error";
    capacity: number;
    occupiedSlots: number;
    totalEntries: number;
    lines: StateLine[];
    error?: string;
  }
  export interface DecodedState {
    fields: { name: string; value: string }[];
    containers: StateContainer[];
    complete: boolean;
  }
  export interface StateReader {
    stateRead(slot: number, off: number, len: number): Promise<{ hex: string }>;
  }
  export function readState(rpc: StateReader, idx: number, source: string, name: string, qpiHeader?: string): Promise<DecodedState>;
}

declare module "@qinit/inspector" {
  import type { StateLine } from "@qinit/inspector/state-format";
  export interface StateDiffLine extends StateLine {
    detail: string;
    internal: boolean;
  }
  export interface DecodedLog {
    severity: string;
    size: number;
    name?: string;
    typeName?: string;
    fields?: Record<string, unknown>;
    candidates?: string[];
    hex: string;
  }
  export interface DecodedCheat {
    line: number;
    text: string;
  }
  export interface DecodedTrace {
    inDecoded: string;
    outDecoded: string;
    caller: string;
    stateDiff: StateDiffLine[];
    logs: DecodedLog[];
    cheats: DecodedCheat[];
  }
  // The IDL is what turns a cheat record into a readable line: the words and the types live there.
  export function describeTrace(
    e: unknown,
    source: string | undefined,
    name: string,
    qpiHeader?: string,
    contractIdl?: ContractIdl,
  ): Promise<DecodedTrace>;
}

declare module "@qinit/proto" {
  export function encodeInputFormat(inputFormat: string): Promise<Uint8Array>;
  export function encodeInputJson(fields: { name: string; type: string }[], json: unknown): Promise<Uint8Array>;
  export function decodeAbi(bytes: Uint8Array, type: string): Promise<unknown>;
  export function contractAddress(contractIndex: number): Uint8Array;
}

declare module "@qinit/core" {
  export interface EngineFaultInfo {
    message: string;
    phase: string;
    failedTick: number;
    failedEpoch: number;
    lastFinalizedTick: number;
    lastFinalizedEpoch: number;
    slot?: number;
    kind?: number;
    entry?: number;
    txId?: string;
  }
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

declare module "@qinit/compiler/browser" {
  export interface CompileDiagnostic {
    severity: "error" | "warning";
    message: string;
    span: { start: number; end: number; line: number; column: number };
    category?: unknown;
  }

  export interface AbiTypeBase {
    size: number;
    align: number;
    format: string;
  }
  export interface AbiScalar extends AbiTypeBase {
    kind: "scalar";
    scalar: string;
  }
  export interface AbiField {
    name: string;
    offset: number;
    size: number;
    type: AbiType;
  }
  export interface AbiStruct extends AbiTypeBase {
    kind: "struct";
    name?: string;
    fields: AbiField[];
  }
  export interface AbiArray extends AbiTypeBase {
    kind: "array";
    count: number;
    element: AbiType;
  }
  export interface AbiCollection extends AbiTypeBase {
    kind: "collection";
    capacity: number;
    value: AbiType;
  }
  export interface AbiHashMap extends AbiTypeBase {
    kind: "hash_map";
    capacity: number;
    key: AbiType;
    value: AbiType;
  }
  export interface AbiHashSet extends AbiTypeBase {
    kind: "hash_set";
    capacity: number;
    key: AbiType;
  }
  export type AbiType =
    | AbiScalar
    | AbiStruct
    | AbiArray
    | AbiCollection
    | AbiHashMap
    | AbiHashSet;

  export interface ContractEntry {
    name: string;
    inputType: number;
    inSize: number;
    outSize: number;
    input: AbiType;
    output: AbiType;
  }
  export interface ContractIdl {
    version: 5;
    name: string;
    slot: number;
    functions: ContractEntry[];
    procedures: ContractEntry[];
    state: AbiStruct;
    sysprocMask: number;
    enums: Array<{ name: string; underlying: string; members: Record<string, string> }>;
    logs: Array<{ name: string; type: AbiStruct }>;
    cheats: ContractCheat[];
    migration?: { oldState: AbiStruct };
    dependencies: string[];
  }
  export interface CompileResult {
    wasm: Uint8Array;
    diagnostics: CompileDiagnostic[];
    idl?: ContractIdl;
    timings?: Record<string, number>;
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
  export function compileContractWithTypeScript(opts: {
    source: string;
    contractName: string;
    slot: number;
    arenaSizeBytes?: number;
    callees?: ContractIdl[];
    calleeSources?: Array<{ name: string; source: string; slot?: number }>;
    qpiHeader?: string;
    strict?: boolean;
    onPhase?: (phase: string) => void | Promise<void>;
  }): Promise<CompileResult>;
}

declare module "@qinit/compiler/analyzer" {
  export function analyzeContract(options: {
    source: string;
    contractName?: string;
    slot?: number;
    qpiHeader?: string;
    callees?: import("@qinit/compiler/browser").ContractIdl[];
    calleeSources?: Array<{ name: string; source: string; slot?: number }>;
  }): {
    diagnostics: import("@qinit/compiler/browser").CompileDiagnostic[];
    idl?: import("@qinit/compiler/browser").ContractIdl;
  };
}
