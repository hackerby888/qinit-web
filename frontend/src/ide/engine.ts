// Main-thread facade for the IDE virtual node. In browsers this is an RPC proxy: the real VirtualNode,
// contract Wasm instances, linear memories, ticker, tracing and state decoding live in engine-worker.ts.
// Bun tests use the same IdeEngineCore in-process because there is no browser UI thread to protect.
import type { ContractIdlView as ContractIdl, EntryView as IdlEntry } from "./idl-view";
import type { EngineLogEvent, TestResult } from "@qinit/engine";
import type { EngineFaultInfo } from "@qinit/core";
import { reportCrash } from "./crash";
import type { GtestProgram } from "@qinit/compiler/browser";
import type { DecodedState as StateDump } from "@qinit/inspector/state-read";
import type {
  Account,
  AssetView,
  DeployImage,
  EngineMemoryUsage,
  EngineTickInfo,
  IdeEngineCore,
  ReplayStep,
  TxProcessed,
  FunctionCallResult,
} from "./engine-core";
import type { EngineEvent, EngineMethod, EngineRequest, EngineWorkerMessage } from "./engine-protocol";

export type { EngineLogEvent } from "@qinit/engine";
export type { EngineFaultInfo } from "@qinit/core";
export type { Account, AssetView, DebugStep, DeployImage, EngineMemoryUsage, EngineTickInfo, FunctionCallResult, ReplayStep, TxDetail, TxProcessed } from "./engine-core";

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface IdeEngineOptions {
  workerFactory?: () => Worker;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export class IdeEngine {
  onTick: ((info: EngineTickInfo) => void) | null = null;
  onTxProcessed: ((event: TxProcessed) => void) | null = null;
  onLog: ((event: EngineLogEvent) => void) | null = null;
  onMemory: ((usage: EngineMemoryUsage) => void) | null = null;
  onFault: ((fault: EngineFaultInfo) => void) | null = null;

  private readonly workerFactory?: () => Worker;
  private readonly timeoutMs: number;
  private readonly workerMode: boolean;
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, PendingCall>();
  private localPromise: Promise<IdeEngineCore> | null = null;
  private local: IdeEngineCore | null = null;
  private recovery: Promise<void> | null = null;
  private recoveringNow = false;
  private disposed = false;
  private faultValue: EngineFaultInfo | null = null;

  private running = false;
  private speedMs = 1000;
  private epochLengthValue = 3000; // what the running chain uses
  private pendingEpochLengthValue = 3000; // what the next reset will build with
  private assetsValue: AssetView[] = [];
  private memoryValue: EngineMemoryUsage = { linearMemoryBytes: 0, stateBytes: 0, contractCount: 0 };
  private accountsValue: Account[] = [];
  private historyValue: ReplayStep[] = [];
  private deployments = new Map<number, { slot: number; wasm: Uint8Array; name: string; idl: ContractIdl }>();
  private sources = new Map<number, { source: string; name: string }>();
  private extraFunds = new Map<string, bigint>();

  constructor(options: IdeEngineOptions = {}) {
    this.workerFactory = options.workerFactory;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.workerMode = !!options.workerFactory || (typeof window !== "undefined" && typeof Worker !== "undefined");
    if (this.workerMode) {
      this.spawnWorker();
    } else {
      this.localPromise = import("./engine-core").then(({ IdeEngineCore: Core }) => {
        const core = new Core();
        this.local = core;
        this.wireLocal(core);
        return core;
      });
    }
  }

  private wireLocal(core: IdeEngineCore): void {
    const syncMemory = () => {
      this.memoryValue = core.memoryUsage();
      this.onMemory?.(this.memoryValue);
    };
    core.onTick = (value) => {
      this.onTick?.(value);
      syncMemory();
    };
    core.onLog = (value) => this.onLog?.(value);
    core.onFault = (value) => this.latchFault(value);
    core.onTxProcessed = (value) => {
      this.assetsValue = core.assets();
      this.onTxProcessed?.(value);
      syncMemory();
    };
  }

  private spawnWorker(): Worker {
    const worker = this.workerFactory
      ? this.workerFactory()
      : new Worker(new URL("./engine-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<EngineWorkerMessage>) => this.handleMessage(event.data);
    worker.onerror = (ev: ErrorEvent) => {
      // The event carries the only copy of what actually went wrong; failWorker degrades to a generic
      // message, so report the real one before it is lost.
      reportCrash(ev.error ?? `virtual node worker crashed: ${ev.message}`, "manual");
      this.failWorker(new Error("virtual node worker crashed"));
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(message: EngineWorkerMessage): void {
    if (message.kind === "event") {
      this.handleEvent(message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.value);
    else pending.reject(new Error(message.error ?? "virtual node worker call failed"));
  }

  private handleEvent(message: EngineEvent): void {
    if (message.event === "transaction") {
      this.assetsValue = message.assets;
      if (!this.recoveringNow) this.onTxProcessed?.(message.value);
    } else if (message.event === "tick") {
      if (!this.recoveringNow) this.onTick?.(message.value);
    } else if (message.event === "memory") {
      this.memoryValue = message.value;
      if (!this.recoveringNow) this.onMemory?.(message.value);
    } else if (message.event === "fault") {
      this.latchFault(message.value);
    } else if (!this.recoveringNow) {
      this.onLog?.(message.value);
    }
  }

  private latchFault(fault: EngineFaultInfo): void {
    if (this.faultValue) {
      return;
    }
    this.faultValue = { ...fault };
    this.running = false;
    this.onFault?.(this.faultValue);
  }

  private failWorker(error: Error): void {
    const failed = this.worker;
    this.worker = null;
    failed?.terminate();
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    if (!this.disposed && !this.faultValue && !this.recoveringNow && !this.recovery) {
      this.recovery = this.restoreWorker()
        .catch((recoveryError) => {
          this.onLog?.({ level: "error", tick: 0, cat: "worker", msg: `virtual node recovery failed: ${(recoveryError as Error).message}` });
        })
        .finally(() => {
          this.recovery = null;
        });
    }
  }

  private async restoreWorker(): Promise<void> {
    this.recoveringNow = true;
    try {
      this.spawnWorker();
      await this.workerCallRaw("setEpochLength", [this.pendingEpochLengthValue]);
      if (this.accountsValue.length) await this.workerCallRaw("restoreAccounts", [this.accountsValue]);
      for (const [slot, source] of this.sources) await this.workerCallRaw("registerSource", [slot, source.source, source.name]);

      const images = [...this.deployments.values()]
        .sort((a, b) => a.slot - b.slot)
        .map(({ slot, wasm, name }) => ({ slot, wasm: wasm.slice(), name }));
      await this.workerCallRaw("reset", [images]);
      for (const [id, amount] of this.extraFunds) await this.workerCallRaw("fundAccount", [id, amount]);
      for (const step of this.historyValue) {
        await this.workerCallRaw("submitProcedure", [step.slot, step.procId, step.entry, step.input, step.key, step.caller, step.contract]);
      }
      this.assetsValue = await this.workerCallRaw<AssetView[]>("assets", []);
      await this.workerCallRaw("setSpeed", [this.speedMs]);
      if (this.running) await this.workerCallRaw("resume", []);
      else await this.workerCallRaw("pause", []);
    } finally {
      this.recoveringNow = false;
      this.onMemory?.(this.memoryValue);
    }
  }

  private async workerCallRaw<T>(method: EngineMethod, args: unknown[]): Promise<T> {
    const worker = this.worker ?? this.spawnWorker();
    const id = ++this.seq;
    const request: EngineRequest = { id, kind: "call", method, args };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        const error = new Error(`virtual node ${method} timed out after ${this.timeoutMs}ms; worker restarted`);
        this.failWorker(error);
      }, this.timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      try {
        worker.postMessage(request);
      } catch (error) {
        this.failWorker(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async call<T>(method: EngineMethod, args: unknown[]): Promise<T> {
    if (this.disposed) throw new Error("virtual node disposed");
    if (!this.workerMode) {
      const core = this.local ?? await this.localPromise!;
      const target = core as unknown as Record<string, (...values: unknown[]) => unknown>;
      return await target[method].apply(core, args) as T;
    }
    if (this.recovery) await this.recovery;
    return this.workerCallRaw<T>(method, args);
  }

  private fire(method: EngineMethod, args: unknown[]): void {
    void this.call(method, args).catch((error) => this.onLog?.({ level: "error", tick: 0, cat: "worker", msg: error.message }));
  }

  private assertOperational(): void {
    if (this.faultValue) {
      throw new Error(`virtual node faulted: ${this.faultValue.message}`);
    }
  }

  async deploy(slot: number, wasm: Uint8Array, idl: ContractIdl): Promise<void> {
    this.assertOperational();
    this.deployments.set(slot, { slot, wasm: wasm.slice(), name: idl.name, idl });
    await this.call("deploy", [slot, wasm.slice(), idl]);
    this.assetsValue = await this.call<AssetView[]>("assets", []);
  }

  async runGtest(program: GtestProgram, runnerWasm: Uint8Array, contracts: Record<number, Uint8Array>): Promise<TestResult[]> {
    return this.call("runGtest", [program, runnerWasm.slice(), Object.fromEntries(Object.entries(contracts).map(([slot, wasm]) => [slot, wasm.slice()]))]);
  }

  start(): void {
    if (!this.faultValue) {
      this.running = true;
      this.fire("start", []);
    }
  }
  stop(): void { this.running = false; this.fire("stop", []); }
  isRunning(): boolean { return this.running; }
  pause(): void { this.running = false; this.fire("pause", []); }
  resume(): void {
    if (!this.faultValue) {
      this.running = true;
      this.fire("resume", []);
    }
  }
  setSpeed(ms: number): void { this.speedMs = Math.max(50, ms); this.fire("setSpeed", [this.speedMs]); }
  speed(): number { return this.speedMs; }

  async step(n = 1): Promise<void> {
    this.assertOperational();
    await this.call("step", [n]);
  }
  epochLength(): number { return this.epochLengthValue; }
  pendingEpochLength(): number { return this.pendingEpochLengthValue; }

  // Staged, not live — the worker applies it when the chain is next rebuilt, so an epoch never reports a
  // last tick that the chain has already passed. Callers pair this with reset().
  setEpochLength(ticks: number): void {
    this.pendingEpochLengthValue = Math.max(0, Math.trunc(ticks));
    this.fire("setEpochLength", [this.pendingEpochLengthValue]);
  }

  async advanceEpoch(): Promise<{ tick: number; epoch: number }> {
    this.assertOperational();
    return this.call("advanceEpoch", []);
  }

  fundAccount(id: string, amount: bigint): void {
    this.assertOperational();
    this.extraFunds.set(id, (this.extraFunds.get(id) ?? 0n) + amount);
    this.fire("fundAccount", [id, amount]);
  }

  async reset(images: DeployImage[]): Promise<void> {
    this.faultValue = null;
    this.running = false;
    if (this.workerMode && !this.worker) {
      this.spawnWorker();
      await this.workerCallRaw("setEpochLength", [this.pendingEpochLengthValue]);
      if (this.accountsValue.length) await this.workerCallRaw("restoreAccounts", [this.accountsValue]);
      for (const [slot, source] of this.sources) await this.workerCallRaw("registerSource", [slot, source.source, source.name]);
    }
    const slots = new Set(images.map((image) => image.slot));
    for (const slot of this.deployments.keys()) if (!slots.has(slot)) this.deployments.delete(slot);
    this.historyValue = [];
    this.extraFunds.clear();
    await this.call("reset", [images.map((image) => ({ ...image, wasm: image.wasm.slice() }))]);
    this.epochLengthValue = this.pendingEpochLengthValue; // the fresh chain is the one built with it
    this.running = true;
    this.assetsValue = await this.call("assets", []);
  }

  async replay(images: DeployImage[]): Promise<void> {
    this.assertOperational();
    this.extraFunds.clear();
    await this.call("replay", [images.map((image) => ({ ...image, wasm: image.wasm.slice() }))]);
    this.running = true;
  }

  async runSteps(images: DeployImage[], steps: ReplayStep[]): Promise<void> {
    this.assertOperational();
    this.extraFunds.clear();
    await this.call("runSteps", [images.map((image) => ({ ...image, wasm: image.wasm.slice() })), steps]);
    this.historyValue = steps.map((step) => ({ ...step }));
    this.running = true;
  }

  exportHistory(): ReplayStep[] { return this.historyValue.map((step) => ({ ...step })); }

  registerSource(slot: number, source: string, name: string): void {
    this.sources.set(slot, { source, name });
    this.fire("registerSource", [slot, source, name]);
  }

  async stateOf(slot: number, source: string, name: string): Promise<StateDump> {
    return this.call("stateOf", [slot, source, name]);
  }

  assets(): AssetView[] { return this.assetsValue; }
  memoryUsage(): EngineMemoryUsage { return { ...(this.local?.memoryUsage() ?? this.memoryValue) }; }

  async callFunction(slot: number, fnId: string, entry: IdlEntry, input: Record<string, unknown>): Promise<unknown> {
    this.assertOperational();
    return this.call("callFunction", [slot, fnId, entry, input]);
  }

  async callFunctionDetailed(slot: number, fnId: string, entry: IdlEntry, input: Record<string, unknown>): Promise<FunctionCallResult> {
    this.assertOperational();
    return this.call("callFunctionDetailed", [slot, fnId, entry, input]);
  }

  async submitProcedure(slot: number, procId: string, entry: IdlEntry, input: Record<string, unknown>, key: string, caller: { seed: string; amount: number }, contract: { name: string; source: string }): Promise<{ targetTick: number }> {
    this.assertOperational();
    const result = await this.call<{ targetTick: number }>("submitProcedure", [slot, procId, entry, input, key, caller, contract]);
    this.historyValue.push({ slot, procId, entry, input, key, caller, contract });
    return result;
  }

  async info(): Promise<EngineTickInfo> { return this.call("info", []); }

  async faultInfo(): Promise<EngineFaultInfo | null> {
    return this.faultValue ?? this.call("faultInfo", []);
  }

  async ensureAccounts(): Promise<Account[]> {
    this.assertOperational();
    const accounts = await this.call<Account[]>("ensureAccounts", []);
    this.accountsValue = accounts;
    return accounts;
  }

  async balanceOf(id: string): Promise<bigint> { return this.call("balanceOf", [id]); }
  async addressOf(slot: number): Promise<string> { return this.call("addressOf", [slot]); }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    this.worker?.terminate();
    this.worker = null;
    const error = new Error("virtual node disposed");
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    if (this.local) this.local.stop();
    else void this.localPromise?.then((core) => core.stop());
  }
}
