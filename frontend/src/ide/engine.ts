// Main-thread facade for the IDE virtual node. In browsers this is an RPC proxy: the real VirtualNode,
// contract Wasm instances, linear memories, ticker, tracing and state decoding live in engine-worker.ts.
// Bun tests use the same IdeEngineCore in-process because there is no browser UI thread to protect.
import type { ContractIdlView as ContractIdl, EntryView as IdlEntry } from "./idl-view";
import type { EngineLogEvent } from "@qinit/engine";
import type { EngineFaultInfo } from "@qinit/core";
import { describeContractError } from "@qinit/core";
import { reportCrash } from "./crash";
import type { DecodedState as StateDump } from "@qinit/inspector/state-read";
import type {
  Account,
  AssetView,
  DeployImage,
  EngineMemoryUsage,
  EngineTickInfo,
  IdeEngineCore,
  ProcedureResult,
  QuAmount,
  ReplayStep,
  TxProcessed,
  FunctionCallResult,
} from "./engine-core";
import type { EngineEvent, EngineMethod, EngineRequest, EngineWorkerMessage } from "./engine-protocol";

export type { EngineLogEvent } from "@qinit/engine";
export type { EngineFaultInfo } from "@qinit/core";
export type { Account, AssetView, DebugStep, DeployImage, EngineMemoryUsage, EngineTickInfo, FunctionCallResult, ProcedureResult, QuAmount, ReplayStep, TxDetail, TxProcessed } from "./engine-core";

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
// a call replayed while the node is rebuilt ran in milliseconds the first time; one that takes this long is the code that hung.
const RECOVERY_STEP_TIMEOUT_MS = 5_000;

export class IdeEngine {
  onTick: ((info: EngineTickInfo) => void) | null = null;
  onTxProcessed: ((event: TxProcessed) => void) | null = null;
  onLog: ((event: EngineLogEvent) => void) | null = null;
  onMemory: ((usage: EngineMemoryUsage) => void) | null = null;
  onFault: ((fault: EngineFaultInfo) => void) | null = null;
  // the node was rebuilt after a call that never returned. `historyKept` is false when the session's earlier calls
  // could not be replayed, and the chain is back at genesis with the contracts deployed.
  onRestart: ((historyKept: boolean) => void) | null = null;

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
  private pausedByUser = false; // survives a reset, replay or test run: a developer who paused to inspect stays paused
  private speedMs = 1000;
  private epochLengthValue = 0; // what the running chain uses; read from the node, never assumed
  private pendingEpochLengthValue: number | null = null; // what the next reset will build with, once the developer set one
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
    let historyKept = true;
    try {
      try {
        await this.rebuildWorker(this.historyValue);
      } catch {
        // a replayed call did not come back: the contract that hung is still deployed, and the session's calls run
        // through it. Keep the contracts and start them from genesis, rather than wait out every call and end on an empty node.
        historyKept = false;
        this.historyValue = [];
        await this.rebuildWorker([]);
      }
    } finally {
      this.recoveringNow = false;
      this.onMemory?.(this.memoryValue);
    }
    this.onRestart?.(historyKept);
  }

  // a fresh worker holding what this session deployed and funded, with `steps` replayed on top.
  private async rebuildWorker(steps: ReplayStep[]): Promise<void> {
    this.spawnWorker();
    if (this.pendingEpochLengthValue !== null) await this.workerCallRaw("setEpochLength", [this.pendingEpochLengthValue]);
    if (this.accountsValue.length) await this.workerCallRaw("restoreAccounts", [this.accountsValue]);
    for (const [slot, source] of this.sources) await this.workerCallRaw("registerSource", [slot, source.source, source.name]);

    const images = [...this.deployments.values()]
      .sort((a, b) => a.slot - b.slot)
      .map(({ slot, wasm, name }) => ({ slot, wasm: wasm.slice(), name }));
    await this.workerCallRaw("reset", [images]);
    for (const [id, amount] of this.extraFunds) await this.workerCallRaw("fundAccount", [id, amount]);
    for (const step of steps) {
      await this.workerCallRaw("submitProcedure", [step.slot, step.procId, step.entry, step.input, step.key, step.caller, step.contract], Math.min(this.timeoutMs, RECOVERY_STEP_TIMEOUT_MS));
    }
    this.assetsValue = await this.workerCallRaw<AssetView[]>("assets", []);
    await this.workerCallRaw("setSpeed", [this.speedMs]);
    if (this.running) await this.workerCallRaw("resume", []);
    else await this.workerCallRaw("pause", []);
  }

  private async workerCallRaw<T>(method: EngineMethod, args: unknown[], timeoutMs = this.timeoutMs): Promise<T> {
    const worker = this.worker ?? this.spawnWorker();
    const id = ++this.seq;
    const request: EngineRequest = { id, kind: "call", method, args };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        const error = new Error(`virtual node ${method} timed out after ${timeoutMs}ms; worker restarted`);
        this.failWorker(error);
      }, timeoutMs);
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

  // a halted chain refuses every call the way a halted node does; the message says so and names the way out.
  private assertOperational(): void {
    if (this.faultValue) {
      throw new Error(`the chain is halted (${describeContractError(this.faultValue.message)} at tick ${this.faultValue.failedTick}) — press ↺ reset or ▶ Compile & Run to restart it`);
    }
  }

  // abandon whatever the worker is doing: pending calls fail with `reason` and the node is rebuilt from the session's history.
  cancelPending(reason: string): void {
    if (this.workerMode && this.pending.size > 0) {
      this.failWorker(new Error(reason));
    }
  }

  async deploy(slot: number, wasm: Uint8Array, idl: ContractIdl): Promise<void> {
    this.assertOperational();
    this.deployments.set(slot, { slot, wasm: wasm.slice(), name: idl.name, idl });
    await this.call("deploy", [slot, wasm.slice(), idl]);
    this.assetsValue = await this.call<AssetView[]>("assets", []);
  }

  start(): void {
    if (!this.faultValue) {
      this.running = true;
      this.pausedByUser = false;
      this.fire("start", []);
    }
  }
  stop(): void { this.running = false; this.fire("stop", []); }
  isRunning(): boolean { return this.running; }
  pause(): void { this.running = false; this.pausedByUser = true; this.fire("pause", []); }
  resume(): void {
    if (!this.faultValue) {
      this.running = true;
      this.pausedByUser = false;
      this.fire("resume", []);
    }
  }

  // the worker's reset restarts its ticker; put a paused chain back the way the developer left it.
  private async restorePause(): Promise<void> {
    this.running = !this.pausedByUser;
    if (this.pausedByUser) {
      await this.call("pause", []);
    }
  }
  setSpeed(ms: number): void { this.speedMs = Math.max(50, ms); this.fire("setSpeed", [this.speedMs]); }
  speed(): number { return this.speedMs; }

  async step(n = 1): Promise<void> {
    this.assertOperational();
    await this.call("step", [n]);
  }
  epochLength(): number { return this.epochLengthValue; }
  pendingEpochLength(): number { return this.pendingEpochLengthValue ?? this.epochLengthValue; }

  // Staged, not live — the worker applies it when the chain is next rebuilt, so an epoch never reports a
  // last tick that the chain has already passed. Callers pair this with reset().
  setEpochLength(ticks: number): void {
    this.pendingEpochLengthValue = Math.max(0, Math.trunc(ticks));
    this.fire("setEpochLength", [this.pendingEpochLengthValue]);
  }

  async advanceEpoch(): Promise<EngineTickInfo> {
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
      if (this.pendingEpochLengthValue !== null) await this.workerCallRaw("setEpochLength", [this.pendingEpochLengthValue]);
      if (this.accountsValue.length) await this.workerCallRaw("restoreAccounts", [this.accountsValue]);
      for (const [slot, source] of this.sources) await this.workerCallRaw("registerSource", [slot, source.source, source.name]);
    }
    const slots = new Set(images.map((image) => image.slot));
    for (const slot of this.deployments.keys()) if (!slots.has(slot)) this.deployments.delete(slot);
    this.historyValue = [];
    this.extraFunds.clear();
    await this.call("reset", [images.map((image) => ({ ...image, wasm: image.wasm.slice() }))]);
    await this.restorePause();
    await this.info(); // the fresh chain's epoch length
    this.assetsValue = await this.call("assets", []);
  }

  async replay(images: DeployImage[]): Promise<void> {
    this.assertOperational();
    this.extraFunds.clear();
    await this.call("replay", [images.map((image) => ({ ...image, wasm: image.wasm.slice() }))]);
    await this.restorePause();
  }

  async runSteps(images: DeployImage[], steps: ReplayStep[]): Promise<void> {
    this.assertOperational();
    this.extraFunds.clear();
    await this.call("runSteps", [images.map((image) => ({ ...image, wasm: image.wasm.slice() })), steps]);
    this.historyValue = steps.map((step) => ({ ...step }));
    await this.restorePause();
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

  async submitProcedure(slot: number, procId: string, entry: IdlEntry, input: Record<string, unknown>, key: string, caller: { seed: string; amount: QuAmount }, contract: { name: string; source: string }): Promise<ProcedureResult> {
    this.assertOperational();
    const result = await this.call<ProcedureResult>("submitProcedure", [slot, procId, entry, input, key, caller, contract]);
    this.historyValue.push({ slot, procId, entry, input, key, caller, contract });
    return result;
  }

  async info(): Promise<EngineTickInfo> {
    const info = await this.call<EngineTickInfo>("info", []);
    this.epochLengthValue = info.epochLastTick - info.epochFirstTick + 1;
    return info;
  }

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
