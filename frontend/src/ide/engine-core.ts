// Run compiled contracts in the page via @qinit/engine's VirtualNode — byte-identical to the node.
//   function (read)  -> querySmartContract (no signing)
//   procedure (write)-> a signed tx (K12 + the engine's faucet seed) -> include in the next tick now
// Worker-owned engine implementation. The browser-facing IdeEngine proxy lives in ./engine.ts.
import { VirtualNode, initK12, runCompiledGtest, type AssetSnapshot, type EngineLogEvent, type TestResult } from "@qinit/engine";
import type { GtestProgram } from "@qinit/compiler/browser";

export type { EngineLogEvent } from "@qinit/engine";
import { encodeInput, encodeInputJson, decodeOutput, contractAddress } from "@qinit/proto";
import { buildSignedTx, deriveIdentity, identityToBytes, bytesToIdentity } from "@qinit/core";
import type { ContractIdlView as ContractIdl, EntryView as IdlEntry } from "./idl-view";
import { readState, describeTrace, jstr } from "@qinit/inspector";
import type { DecodedState as StateDump } from "@qinit/inspector";

// Re-export the engine's asset-universe snapshot under the IDE's name (one inter-contract asset + its holdings).
export type AssetView = AssetSnapshot;

export interface EngineMemoryUsage {
  linearMemoryBytes: number;
  stateBytes: number;
  contractCount: number;
}

const randomSeed = (): string =>
  Array.from({ length: 55 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

export interface Account {
  seed: string;
  id: string;
}

interface TxMeta {
  name: string;
  key: string;
  contractName: string;
  contractSource: string;
}

// One invocation in a transaction's call sequence — a user procedure, an inter-contract call, or a system
// procedure — fully decoded for the step debugger.
export interface DebugStep {
  seq: number;
  slot: number;
  contract: string;
  kind: number; // 0 function, 1 procedure, 2 system procedure
  entry: number; // entry-point id (user function/procedure input type) — resolves the source name for goto-source
  label: string; // human label, e.g. "procedure #1" or "BEGIN_TICK"
  ok: boolean;
  caller: string;
  in: string;
  out: string;
  diff: { label: string; text: string }[];
  hostCalls: string[];
  logs: string[];
}

export interface TxDetail {
  in: string;
  out: string;
  caller: string;
  diff: { label: string; text: string }[];
  hostCalls: string[];
  logs: string[];
  steps: DebugStep[]; // the whole call sequence, for the step debugger
}

export interface FunctionCallResult {
  output: unknown;
  detail?: TxDetail;
}

// System-procedure id -> name (core contract_def.h SystemProcedureID order).
const SP_LABEL: Record<number, string> = {
  0: "INITIALIZE", 1: "BEGIN_EPOCH", 2: "END_EPOCH", 3: "BEGIN_TICK", 4: "END_TICK",
  5: "PRE_RELEASE_SHARES", 6: "PRE_ACQUIRE_SHARES", 7: "POST_RELEASE_SHARES", 8: "POST_ACQUIRE_SHARES",
  9: "POST_INCOMING_TRANSFER", 10: "SET_SHAREHOLDER_PROPOSAL", 11: "SET_SHAREHOLDER_VOTES",
};

function stepLabel(kind: number, entry: number): string {
  if (kind === 2) {
    return SP_LABEL[entry] ?? `sysproc #${entry}`;
  }
  if (kind === 0) {
    return `function #${entry}`;
  }
  return `procedure #${entry}`;
}

const formatLog = (log: Awaited<ReturnType<typeof describeTrace>>["logs"][number]) => {
  const detail = log.name
    ? `${log.name}${log.typeName ? `·${log.typeName}` : ""} ${jstr(log.fields)}`
    : `${log.size}B ${log.hex.slice(0, 34)}…`;
  return `${log.severity} ${detail}`;
};

export interface TxProcessed {
  key: string;
  name: string;
  tick: number;
  moneyFlew: boolean;
  detail?: TxDetail;
}

// One replayable write — the args of a submitProcedure call, kept so the whole session can be re-run
// against a fresh chain (reset + replay), or saved into a scenario.
export interface ReplayStep {
  slot: number;
  procId: string;
  entry: IdlEntry;
  input: Record<string, unknown>;
  key: string;
  caller: { seed: string; amount: number };
  contract: { name: string; source: string };
}

// A contract as it must be re-deployed on reset — its wasm + slot + name (INITIALIZE re-runs on deploy).
export interface DeployImage {
  slot: number;
  wasm: Uint8Array;
  name: string;
}

// The IDE keeps the engine's real tick-bound transaction path, but submitProcedure advances the inclusion tick
// synchronously for instant UX. Signature verification and execution fees remain off in this browser sandbox.
// liteTicking: skip the per-tick committee quorum (8 FourQ votes + leader signature) for EMPTY ticks. The IDE
// never serves the peer protocol that reads those records, and it lets a full-epoch jump (~3000 ticks) run
// without signing ~27k times on the main thread. State digests are unaffected (still computed every tick).
const IDE_ENGINE_OPTS = { mempool: true, verifySigs: false, fees: "off", liteTicking: true } as const;

export class IdeEngineCore {
  private engine = new VirtualNode(IDE_ENGINE_OPTS);
  private seed: string | null = null;
  private k12Ready = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private accounts: Account[] = [];
  private speedMs = 1000;
  private history: ReplayStep[] = []; // every applied write this session, for replay
  private contractSources = new Map<number, { source: string; name: string }>(); // slot -> source, for per-step trace decoding

  onTick: ((info: { tick: number; epoch: number }) => void) | null = null;
  onTxProcessed: ((e: TxProcessed) => void) | null = null;
  onLog: ((e: EngineLogEvent) => void) | null = null; // engine diagnostic-log stream -> the IDE's engine-log popup

  // Deploy constructs the contract (INITIALIZE) and digests its state, so K12 must be ready first.
  async deploy(slot: number, wasm: Uint8Array, idl: ContractIdl): Promise<void> {
    await this.ensureK12();
    this.engine.deploy(slot, wasm, idl.name);
  }

  // Execute a TS-compiled core-lite-style gtest program on a throwaway virtual node.
  async runGtest(program: GtestProgram, runnerWasm: Uint8Array, contracts: Record<number, Uint8Array>): Promise<TestResult[]> {
    return runCompiledGtest(program, runnerWasm, contracts);
  }

  // Emulate the live network: advance one tick per `speedMs`. Procedure submissions also advance their own
  // inclusion tick synchronously, so the timer is only responsible for otherwise-empty chain time.
  start(): void {
    if (this.ticker) {
      return;
    }
    void this.engine.setDebug(true); // capture per-tx debug traces for the inspector
    this.engine.onLog = (e) => this.onLog?.(e); // forward the engine's lifecycle/error log stream
    this.schedule();
  }

  stop(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private schedule(): void {
    this.ticker = setInterval(() => {
      void this.tickOnce();
    }, this.speedMs);
  }

  // ---- tick controls (deterministic dev testing — drive time by hand instead of the wall clock) ----

  isRunning(): boolean {
    return this.ticker !== null;
  }

  // Stop the auto-ticker; the chain holds at the current tick until resume()/step().
  pause(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  resume(): void {
    if (this.ticker) {
      return;
    }
    this.schedule();
  }

  // Ticks per second knob — re-arms the timer at the new cadence if it's running.
  setSpeed(ms: number): void {
    this.speedMs = Math.max(50, ms);
    if (this.ticker) {
      clearInterval(this.ticker);
      this.schedule();
    }
  }

  speed(): number {
    return this.speedMs;
  }

  // Advance exactly n ticks now, independent of the auto-ticker. Each tick crosses an epoch boundary when
  // due (END_EPOCH -> BEGIN_EPOCH) then runs BEGIN_TICK asc -> due mempool txs -> END_TICK desc. onTick is
  // emitted once at the end so a long jump doesn't thrash the UI.
  async step(n = 1): Promise<void> {
    for (let i = 0; i < n; i++) {
      // On chunk boundaries: emit a tick update so a long jump shows live progress (not a frozen counter), and
      // yield to the event loop so the page stays responsive during a multi-thousand-tick epoch jump.
      const checkpoint = i > 0 && i % 128 === 0;
      await this.tickOnce(i === n - 1 || checkpoint);
      if (checkpoint) {
        await new Promise<void>((r) => setTimeout(r));
      }
    }
  }

  // Ticks per epoch — the boundary where the network switches epoch.
  epochLength(): number {
    return this.engine.sim.epochLength;
  }

  // Jump to the next epoch: fast-forward ticks to the upcoming epoch boundary. The switch itself
  // (END_EPOCH -> epoch++ -> BEGIN_EPOCH) is fired by the tick mechanism (sim.advance) as the tick crosses
  // the boundary — same as the live network reaching the last tick of an epoch — not by hand.
  async advanceEpoch(): Promise<{ tick: number; epoch: number }> {
    const m = this.engine.sim.epochLength;
    const cur = (await this.engine.tickInfo()).tick;
    const target = m > 0 ? (Math.floor(cur / m) + 1) * m : cur + 1;
    await this.step(target - cur);
    const info = await this.engine.tickInfo();
    this.onTick?.(info);
    return info;
  }

  // Credit an account straight from the testnet faucet (sim.fund -> spectrum credit).
  fundAccount(id: string, amount: bigint): void {
    this.engine.fund(identityToBytes(id), amount);
  }

  // Wipe the chain back to genesis: a fresh engine, every contract re-deployed from its wasm (re-running
  // INITIALIZE), the same dev accounts re-funded, tick/epoch back to 0, history cleared.
  async reset(images: DeployImage[]): Promise<void> {
    this.stop();
    await this.ensureK12();
    this.engine = new VirtualNode(IDE_ENGINE_OPTS);
    void this.engine.setDebug(true);
    this.engine.onLog = (e) => this.onLog?.(e);
    this.history = [];

    for (const img of [...images].sort((a, b) => a.slot - b.slot)) {
      this.engine.deploy(img.slot, img.wasm, img.name);
    }
    await this.reseedAccounts();
    this.start();
  }

  // Reset to genesis, then re-apply every write this session in order. submitProcedure includes each write in
  // its own next tick, preserving both ordering and tick-dependent behavior.
  async replay(images: DeployImage[]): Promise<void> {
    await this.runSteps(images, this.history.slice());
  }

  // Reset to genesis, then apply a specific ordered list of writes (each landed on its own ticks). The
  // scenario runner uses this to re-drive a saved test against a fresh chain; replay() feeds it the live
  // history.
  async runSteps(images: DeployImage[], steps: ReplayStep[]): Promise<void> {
    await this.reset(images);
    for (const s of steps) {
      await this.submitProcedure(s.slot, s.procId, s.entry, s.input, s.key, s.caller, s.contract);
    }
  }

  // The writes recorded this session — used to capture a scenario from what you just ran.
  exportHistory(): ReplayStep[] {
    return this.history.slice();
  }

  // Re-seed the faucet and re-fund the existing dev accounts into a fresh engine, keeping their identities
  // stable across a reset (so the caller dropdown / balances stay meaningful).
  private async reseedAccounts(): Promise<void> {
    await this.engine.seedFaucet();
    for (const a of this.accounts) {
      if (a.seed !== this.seed) {
        this.engine.fund(identityToBytes(a.id), 1_000_000_000_000n);
      }
    }
  }

  private async tickOnce(emit = true): Promise<void> {
    this.engine.advanceTick(1);
    const info = await this.engine.tickInfo();

    if (emit) {
      this.onTick?.(info);
    }
  }

  // Tell the decoder which source backs a slot, so inter-contract / system-procedure steps decode their
  // own StateData (not the originating contract's). Called by the IDE on every deploy.
  registerSource(slot: number, source: string, name: string): void {
    this.contractSources.set(slot, { source, name });
  }

  // Decode the just-processed tx (debug entries added since `base`) into the step debugger's call sequence —
  // each invocation's decoded in/out, caller, named StateData diff, host-event timeline and logs. The
  // inline tx detail reuses the primary (user-procedure) step. Reuses the CLI's trace decoder; never throws.
  private async traceOf(base: number, t: TxMeta): Promise<TxDetail | undefined> {
    try {
      const entries = (await this.engine.debugTrace()).entries.slice(base);
      if (!entries.length) {
        return undefined;
      }

      const steps: DebugStep[] = [];
      for (const e of entries) {
        const src = this.contractSources.get(e.index) ?? { source: t.contractSource, name: t.contractName };
        const tv = await describeTrace(e, src.source, src.name);
        steps.push({
          seq: e.seq,
          slot: e.index,
          contract: src.name,
          kind: e.kind,
          entry: e.entry,
          label: stepLabel(e.kind, e.entry),
          ok: e.ok,
          caller: tv.caller,
          in: tv.inDecoded,
          out: tv.outDecoded,
          diff: tv.stateDiff.filter((line) => !line.internal).map(({ label, text }) => ({ label, text })),
          hostCalls: e.hostCalls.map((h) => `${h.name} ${h.detail}`),
          logs: tv.logs.map(formatLog),
        });
      }

      const primary = steps.find((s) => s.kind === 1) ?? steps[steps.length - 1];
      return {
        in: primary.in,
        out: primary.out,
        caller: primary.caller,
        diff: primary.diff,
        hostCalls: primary.hostCalls,
        logs: primary.logs,
        steps,
      };
    } catch {
      return undefined;
    }
  }

  // Decode a deployed contract's CURRENT state (scalars + containers) — the qinit `state` inspector.
  async stateOf(slot: number, source: string, name: string): Promise<StateDump> {
    return readState(this.engine, slot, source, name);
  }

  // The asset universe (issued assets + share holdings) for the inspector panel.
  assets(): AssetView[] {
    return this.engine.assetUniverse();
  }

  // Exact resident Wasm allocation owned by the virtual node. Each live contract normally owns one linear
  // memory containing StateData + fixed IO/locals/context regions + its scratch arena. Keep shared memories
  // unique so a future imported-memory deployment is not counted once per contract.
  memoryUsage(): EngineMemoryUsage {
    const memories = new Set<WebAssembly.Memory>();
    let stateBytes = 0;
    for (const contract of this.engine.sim.contracts.values()) {
      memories.add(contract.mem);
      stateBytes += contract.stateSize;
    }
    let linearMemoryBytes = 0;
    for (const memory of memories) linearMemoryBytes += memory.buffer.byteLength;
    return { linearMemoryBytes, stateBytes, contractCount: this.engine.sim.contracts.size };
  }

  // Read a function's output. No crypto — a direct query against the deployed wasm.
  async callFunction(slot: number, fnId: string, entry: IdlEntry, input: Record<string, unknown>): Promise<unknown> {
    const bytes = entry.inFields.length ? await encodeInputJson(entry.inFields, input) : await encodeInput("");
    const out = await this.engine.querySmartContract(slot, Number(fnId), bytes);
    return entry.out ? decodeOutput(out, entry.out) : null;
  }

  // Interactive function call with the same decoded trace surface procedures use. The plain callFunction
  // remains output-only for generated clients and scenario assertions.
  async callFunctionDetailed(slot: number, fnId: string, entry: IdlEntry, input: Record<string, unknown>): Promise<FunctionCallResult> {
    const bytes = entry.inFields.length ? await encodeInputJson(entry.inFields, input) : await encodeInput("");
    const base = (await this.engine.debugTrace()).entries.length;
    const out = await this.engine.querySmartContract(slot, Number(fnId), bytes);
    const src = this.contractSources.get(slot) ?? { name: `Contract ${slot}`, source: "" };
    const detail = await this.traceOf(base, { name: entry.name, key: "", contractName: src.name, contractSource: src.source });
    return { output: entry.out ? decodeOutput(out, entry.out) : null, detail };
  }

  // Submit a signed procedure transaction for the next tick and advance to that tick before returning. This
  // keeps BEGIN_TICK -> transaction -> END_TICK / TickData ordering without a wall-clock mempool wait.
  async submitProcedure(slot: number, procId: string, entry: IdlEntry, input: Record<string, unknown>, key: string, caller: { seed: string; amount: number }, contract: { name: string; source: string }): Promise<{ targetTick: number }> {
    // Freeze the wall-clock ticker while signing so the chosen next tick cannot become stale. A manually
    // paused engine stays paused; a running engine resumes after inclusion or rejection.
    const resumeTicker = this.isRunning();
    if (resumeTicker) this.pause();
    try {
      await this.ensureK12();

      const payload = entry.inFields.length ? await encodeInputJson(entry.inFields, input) : await encodeInput("");
      const ti = await this.engine.tickInfo();
      const targetTick = ti.tick + 1;

      const tx = await buildSignedTx(caller.seed, {
        destination: contractAddress(slot),
        amount: caller.amount,
        tick: targetTick,
        inputType: Number(procId),
        payload,
      });

      const pending = { name: entry.name, key, contractName: contract.name, contractSource: contract.source };
      const base = (await this.engine.debugTrace()).entries.length;
      const result = await this.engine.broadcastTx(tx.bytes);
      if (!result.ok) {
        throw new Error(String(result.message ?? "transaction rejected"));
      }

      this.engine.advanceTick(1);
      const included = await this.engine.tickInfo();
      const detail = await this.traceOf(base, pending);
      const status = result.transactionId ? await this.engine.txStatus(targetTick, result.transactionId) : null;
      const moneyFlew = status?.moneyFlew ?? !!result.moneyFlew;

      this.history.push({ slot, procId, entry, input, key, caller, contract });
      this.onTxProcessed?.({ key, name: entry.name, tick: included.tick, moneyFlew, detail });
      this.onTick?.(included);
      return { targetTick: included.tick };
    } finally {
      if (resumeTicker) this.resume();
    }
  }

  // Current in-process engine time (advances explicitly on invoke/advanceTick).
  async info(): Promise<{ tick: number; epoch: number }> {
    return this.engine.tickInfo();
  }

  // Dev accounts: the faucet seed + a couple of funded random seeds. A procedure's caller is one of
  // these — chosen in the UI, used to sign the tx and pay its value.
  async ensureAccounts(): Promise<Account[]> {
    if (this.accounts.length) {
      return this.accounts;
    }
    await this.ensureSigner();

    const faucet = this.seed!;
    this.accounts.push({ seed: faucet, id: (await deriveIdentity(faucet)).identity });

    for (let i = 0; i < 2; i++) {
      const seed = randomSeed();
      const { identity } = await deriveIdentity(seed);
      this.engine.fund(identityToBytes(identity), 1_000_000_000_000n);
      this.accounts.push({ seed, id: identity });
    }

    return this.accounts;
  }

  // Restore the stable dev identities before rebuilding a worker after a timeout/crash. reset()/runSteps()
  // then re-seed and fund these accounts in the fresh VirtualNode.
  restoreAccounts(accounts: Account[]): void {
    this.accounts = accounts.map((account) => ({ ...account }));
    this.seed = this.accounts[0]?.seed ?? null;
  }

  async balanceOf(id: string): Promise<bigint> {
    const e = await this.engine.balance(id);
    try {
      return BigInt(e.balance);
    } catch {
      return 0n;
    }
  }

  // A deployed contract's address = id(slot, 0, 0, 0).
  async addressOf(slot: number): Promise<string> {
    return bytesToIdentity(contractAddress(slot));
  }

  private async ensureK12(): Promise<void> {
    if (!this.k12Ready) {
      await initK12();
      this.k12Ready = true;
    }
  }

  // The write path also needs a funded seed to sign the tx — fund it from the engine faucet lazily.
  private async ensureSigner(): Promise<void> {
    await this.ensureK12();
    if (!this.seed) {
      await this.engine.seedFaucet();
      this.seed = (await this.engine.fundedSeed()) ?? null;
    }
    if (!this.seed) {
      throw new Error("the engine faucet returned no funded seed");
    }
  }
}
