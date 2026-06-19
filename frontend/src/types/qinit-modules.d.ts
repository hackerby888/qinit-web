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
  }
  export function initK12(): Promise<void>;
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
