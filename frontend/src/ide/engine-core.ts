// Run compiled contracts in the page via @qinit/engine's VirtualNode — byte-identical to the node.
//   function (read)  -> querySmartContract (no signing)
//   procedure (write)-> a signed tx (K12 + the engine's faucet seed) -> include in the next tick now
// Worker-owned engine implementation. The browser-facing IdeEngine proxy lives in ./engine.ts.
import { DEFAULT_EPOCH_LENGTH, VirtualNode, initK12, type AssetSnapshot, type EngineLogEvent } from "@qinit/engine";

export type { EngineLogEvent } from "@qinit/engine";
import { encodeInputFormat, encodeInputJson, decodeAbi, contractAddress, traceDescendants } from "@qinit/proto";
import { buildSignedTx, deriveIdentity, identityToBytes, bytesToIdentity, type DebugEntry, type EngineFaultInfo } from "@qinit/core";
import type { ContractIdlView as ContractIdl, EntryView as IdlEntry } from "./idl-view";
import { describeTrace, mergePrints, type DecodedCheat, type DecodedTrace } from "@qinit/inspector";
import { readState } from "@qinit/inspector/state-read";
import { jsonText } from "@qinit/inspector/state-format";
import type { DecodedState as StateDump } from "@qinit/inspector/state-read";

// Re-export the engine's asset-universe snapshot under the IDE's name (one inter-contract asset + its holdings).
export type AssetView = AssetSnapshot;

export interface EngineMemoryUsage {
  linearMemoryBytes: number;
  stateBytes: number;
  contractCount: number;
}

export interface EngineTickInfo {
  tick: number;
  epoch: number;
  // the running epoch's own bounds, so the panel never derives them from `tick % length`.
  epochFirstTick: number;
  epochLastTick: number;
  fault?: EngineFaultInfo;
}

const randomSeed = (): string =>
  Array.from({ length: 55 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

export interface Account {
  seed: string;
  id: string;
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
  prints: string[]; // CC_PRINT output — dev scaffolding, never a chain log
}

// the frame the developer invoked. `callees` are the frames it reached in other contracts; `prints` covers all of them, in run order.
export interface TxDetail {
  in: string;
  out: string;
  caller: string;
  diff: { label: string; text: string }[];
  hostCalls: string[];
  logs: string[];
  prints: string[]; // CC_PRINT output — dev scaffolding, never a chain log
  callees: DebugStep[];
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
  // an unnamed log still names the structs it could be, when size, severity and the _type word left more than one
  const detail = log.name
    ? `${log.name}${log.typeName ? `·${log.typeName}` : ""} ${jsonText(log.fields)}`
    : `${log.candidates ? `?${log.candidates.join("|")} ` : ""}${log.size}B ${log.hex.slice(0, 34)}…`;
  return `${log.severity} ${detail}`;
};

export interface TxProcessed {
  key: string;
  name: string;
  contract: string;
  tick: number;
  txId?: string;
  moneyFlew: boolean;
  // false when the tick included the transaction but the procedure never ran (the node drops a transfer the balance cannot cover).
  executed: boolean;
  detail?: TxDetail;
}

export interface ProcedureResult {
  targetTick: number;
  txId?: string;
  // whether the tick's data holds the transaction, as the node reports it.
  included: boolean;
  moneyFlew: boolean;
  executed: boolean;
}

// qu on the wire is a 64-bit integer; a number only carries it exactly below 2^53.
export type QuAmount = number | bigint;

// one frame of a print, e.g. `Counter:28 "adding" 5`; the contract is named only when more than one printed.
const printLine = (cheat: DecodedCheat): string => {
  const blockRows = cheat.blocks
    ? [...cheat.blocks.fields.map((field) => `${field.name} ${field.value}`), ...cheat.blocks.containers.flatMap((container) => container.lines.map((row) => `${row.label} ${row.text}`))]
    : [];
  return [`${cheat.contract ?? ""}:${cheat.line} ${cheat.text}`, ...blockRows.map((row) => `  ${row}`)].join("\n");
};

const TRACE_KIND_FUNCTION = 0;
const TRACE_KIND_PROCEDURE = 1;
// enough for one call's frames plus the tick's system procedures on every deployed contract.
const TRACE_WINDOW = 200;

// One replayable write — the args of a submitProcedure call, kept so the whole session can be re-run
// against a fresh chain (reset + replay), or saved into a scenario.
export interface ReplayStep {
  slot: number;
  procId: string;
  entry: IdlEntry;
  input: Record<string, unknown>;
  key: string;
  caller: { seed: string; amount: QuAmount };
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
// minIoBytes: 0 because the IDE compiles a 64 MiB arena (compile/worker.ts), below the core io minimum a node enforces by default.
const IDE_ENGINE_OPTS = { mempool: true, verifySigs: false, fees: "off", liteTicking: true, minIoBytes: 0 } as const;

export class IdeEngineCore {
  // Staged until the chain is next rebuilt — see setEpochLength.
  private epochLengthValue = DEFAULT_EPOCH_LENGTH;
  private engine = this.freshNode();
  private seed: string | null = null;
  private k12Ready = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private accounts: Account[] = [];
  private speedMs = 1000;
  private history: ReplayStep[] = []; // every applied write this session, for replay
  private contractSources = new Map<number, { source: string; name: string }>(); // slot -> source, for per-step trace decoding
  private faultValue: EngineFaultInfo | null = null;

  onTick: ((info: EngineTickInfo) => void) | null = null;
  onTxProcessed: ((e: TxProcessed) => void) | null = null;
  onLog: ((e: EngineLogEvent) => void) | null = null; // engine diagnostic-log stream -> the IDE's engine-log popup
  onFault: ((fault: EngineFaultInfo) => void) | null = null;

  // tracing is on from the first tick: a call's result, prints and "did it run" all come from its trace.
  private freshNode(): VirtualNode {
    const node = new VirtualNode({ ...IDE_ENGINE_OPTS, epochLength: this.epochLengthValue });
    void node.setDebug(true);
    node.onLog = (event) => this.onLog?.(event);
    return node;
  }

  private latchFault(fault: EngineFaultInfo): EngineFaultInfo {
    if (this.faultValue) {
      return this.faultValue;
    }
    const firstFault = { ...fault };
    this.faultValue = firstFault;
    this.stop();
    this.onFault?.(firstFault);
    return firstFault;
  }

  private async captureFault(): Promise<EngineFaultInfo | null> {
    const fault = await this.engine.faultInfo();
    return fault ? this.latchFault(fault) : null;
  }

  private async runEngineOperation<T>(operation: () => T | Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      await this.captureFault();
      throw error;
    }
  }

  // Deploy constructs the contract (INITIALIZE) and digests its state, so K12 must be ready first.
  async deploy(slot: number, wasm: Uint8Array, idl: ContractIdl): Promise<void> {
    await this.ensureK12();
    await this.runEngineOperation(() => this.engine.deploy(slot, wasm, idl.name));
  }

  // Emulate the live network: advance one tick per `speedMs`. Procedure submissions also advance their own
  // inclusion tick synchronously, so the timer is only responsible for otherwise-empty chain time.
  start(): void {
    if (this.faultValue || this.ticker) {
      return;
    }
    this.schedule();
  }

  stop(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private schedule(): void {
    if (this.faultValue) {
      return;
    }
    this.ticker = setInterval(() => {
      void this.tickOnce().catch(() => undefined);
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
    if (this.faultValue || this.ticker) {
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

  // Staged, applied by the next reset. A live change would leave the epoch's own arithmetic wrong: the
  // node reports initialTick as epoch * length, so shortening mid-epoch puts the epoch's last tick behind
  // the tick already reached. Rebuilding from genesis keeps every epoch starting where it claims to.
  setEpochLength(ticks: number): void {
    this.epochLengthValue = Math.max(0, Math.trunc(ticks));
  }

  // jump into the next epoch with the node's own routine, which crosses the boundary (END_EPOCH -> epoch++ ->
  // BEGIN_EPOCH); a tick target computed here once stopped on the epoch's last tick, one short of the switch.
  async advanceEpoch(): Promise<EngineTickInfo> {
    await this.runEngineOperation(() => this.engine.advanceEpoch());
    const info = await this.info();
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
    this.engine = this.freshNode();
    this.faultValue = null;
    this.history = [];

    await this.runEngineOperation(async () => {
      for (const img of [...images].sort((a, b) => a.slot - b.slot)) {
        this.engine.deploy(img.slot, img.wasm, img.name);
      }
      await this.reseedAccounts();
      this.start();
    });
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
    await this.runEngineOperation(async () => {
      this.engine.advanceTick(1);
      const info = await this.tickInfo();

      if (info.fault) {
        this.latchFault(info.fault);
      }
      if (emit) {
        this.onTick?.(info);
      }
    });
  }

  // Tell the decoder which source backs a slot, so inter-contract / system-procedure steps decode their
  // own StateData (not the originating contract's). Called by the IDE on every deploy.
  registerSource(slot: number, source: string, name: string): void {
    this.contractSources.set(slot, { source, name });
  }

  // the newest trace sequence number: a call's own frames are the ones recorded after it. The ring drops old
  // entries, so a position in the array says nothing once it has wrapped; the sequence keeps counting.
  private async newestTraceSeq(): Promise<number> {
    const newest = (await this.engine.debugTrace(0, 1)).entries;
    return newest.length ? newest[newest.length - 1].seq : 0;
  }

  // a map entry's row is named by its key, which an update leaves untouched and so out of the diff; read it from the state the call just left.
  private keyReader(slot: number): (off: number, size: number) => Promise<Uint8Array | undefined> {
    return async (off, size) => {
      const { hex } = await this.engine.stateRead(slot, off, size);
      return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
    };
  }

  private async decodeStep(entry: DebugEntry, fallback: { name: string; source: string }): Promise<{ step: DebugStep; view: DecodedTrace }> {
    const src = this.contractSources.get(entry.index) ?? fallback;
    // no IDL is passed on purpose: the tracer derives a full one from the source, which is what
    // decodes the logs and the state diff — and it carries the cheat table too.
    const view = await describeTrace(entry, src.source, src.name, undefined, undefined, undefined, this.keyReader(entry.index));
    const step: DebugStep = {
      seq: entry.seq,
      slot: entry.index,
      contract: src.name,
      kind: entry.kind,
      entry: entry.entry,
      label: stepLabel(entry.kind, entry.entry),
      ok: entry.ok,
      caller: view.caller,
      in: view.inDecoded,
      out: view.outDecoded,
      diff: view.stateDiff.filter((line) => !line.internal).map(({ label, text }) => ({ label, text })),
      hostCalls: entry.hostCalls.map((h) => `${h.name} ${h.detail}`),
      logs: view.logs.map(formatLog),
      prints: view.cheats.map(printLine),
    };
    return { step, view };
  }

  // decode what a call left in the trace after `sinceSeq`. The summary is the frame the developer invoked — the
  // last one matching its slot, kind and entry, since a callee completes before its caller — and the debugger
  // gets every frame. Undefined when that frame is absent: the call never ran. Never throws.
  private async traceOf(sinceSeq: number, call: { slot: number; kind: number; entry: number }, fallback: { name: string; source: string }): Promise<TxDetail | undefined> {
    try {
      const entries = (await this.engine.debugTrace(sinceSeq, TRACE_WINDOW)).entries;
      const top = [...entries].reverse().find((entry) => entry.index === call.slot && entry.kind === call.kind && entry.entry === call.entry);
      if (!top) {
        return undefined;
      }

      const decoded = new Map<number, { step: DebugStep; view: DecodedTrace }>();
      for (const entry of entries) {
        decoded.set(entry.seq, await this.decodeStep(entry, fallback));
      }

      const own = decoded.get(top.seq)!;
      const callees = traceDescendants(top, entries, sinceSeq).map(({ entry }) => decoded.get(entry.seq)!);
      const prints = mergePrints([own, ...callees].map(({ step, view }) => ({ contract: step.contract, cheats: view.cheats })));

      return {
        in: own.step.in,
        out: own.step.out,
        caller: own.step.caller,
        diff: own.step.diff,
        hostCalls: own.step.hostCalls,
        logs: own.step.logs,
        prints: prints.map(printLine),
        callees: callees.map(({ step }) => step),
        steps: entries.map((entry) => decoded.get(entry.seq)!.step),
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
    const bytes = entry.inFields.length ? await encodeInputJson(entry.inFields, input) : await encodeInputFormat("");
    const out = await this.runEngineOperation(() => this.engine.querySmartContract(slot, Number(fnId), bytes));
    return entry.out ? decodeAbi(out, entry.out) : null;
  }

  // Interactive function call with the same decoded trace surface procedures use. The plain callFunction
  // remains output-only for generated clients and scenario assertions.
  async callFunctionDetailed(slot: number, fnId: string, entry: IdlEntry, input: Record<string, unknown>): Promise<FunctionCallResult> {
    const bytes = entry.inFields.length ? await encodeInputJson(entry.inFields, input) : await encodeInputFormat("");
    const sinceSeq = await this.newestTraceSeq();
    const out = await this.runEngineOperation(() => this.engine.querySmartContract(slot, Number(fnId), bytes));
    const src = this.contractSources.get(slot) ?? { name: `Contract ${slot}`, source: "" };
    const detail = await this.traceOf(sinceSeq, { slot, kind: TRACE_KIND_FUNCTION, entry: Number(fnId) }, src);
    return { output: entry.out ? await decodeAbi(out, entry.out) : null, detail };
  }

  // Submit a signed procedure transaction for the next tick and advance to that tick before returning. This
  // keeps BEGIN_TICK -> transaction -> END_TICK / TickData ordering without a wall-clock mempool wait.
  async submitProcedure(slot: number, procId: string, entry: IdlEntry, input: Record<string, unknown>, key: string, caller: { seed: string; amount: QuAmount }, contract: { name: string; source: string }): Promise<ProcedureResult> {
    // Freeze the wall-clock ticker while signing so the chosen next tick cannot become stale. A manually
    // paused engine stays paused; a running engine resumes after inclusion or rejection.
    const resumeTicker = this.isRunning();
    if (resumeTicker) this.pause();
    try {
      return await this.runEngineOperation(async () => {
        await this.ensureK12();

        const payload = entry.inFields.length ? await encodeInputJson(entry.inFields, input) : await encodeInputFormat("");
        const ti = await this.engine.tickInfo();
        const targetTick = ti.tick + 1;

        const tx = await buildSignedTx(caller.seed, {
          destination: contractAddress(slot),
          amount: caller.amount,
          tick: targetTick,
          inputType: Number(procId),
          payload,
        });

        const sinceSeq = await this.newestTraceSeq();
        const result = await this.engine.broadcastTx(tx.bytes);
        if (!result.ok) {
          throw new Error(String(result.message ?? "transaction rejected"));
        }

        this.engine.advanceTick(1);
        const included = await this.tickInfo();
        const detail = await this.traceOf(sinceSeq, { slot, kind: TRACE_KIND_PROCEDURE, entry: Number(procId) }, contract);
        const status = result.transactionId ? await this.engine.txStatus(targetTick, result.transactionId) : null;
        const moneyFlew = status?.moneyFlew ?? !!result.moneyFlew;
        // the procedure's own frame is the only proof it ran; a transfer the balance cannot cover is included and dropped.
        const executed = detail !== undefined;

        this.history.push({ slot, procId, entry, input, key, caller, contract });
        this.onTxProcessed?.({ key, name: entry.name, contract: contract.name, tick: included.tick, txId: result.transactionId, moneyFlew, executed, detail });
        this.onTick?.(included);
        return { targetTick: included.tick, txId: result.transactionId, included: status?.found ?? true, moneyFlew, executed };
      });
    } finally {
      if (resumeTicker && !this.faultValue) this.resume();
    }
  }

  private async tickInfo(): Promise<EngineTickInfo> {
    const info = await this.engine.tickInfo();
    const epoch = this.engine.epochInfo();
    return { ...info, epochFirstTick: epoch.initialTick, epochLastTick: epoch.epochLastTick };
  }

  // Current in-process engine time (advances explicitly on invoke/advanceTick).
  async info(): Promise<EngineTickInfo> {
    const info = await this.tickInfo();
    if (info.fault) {
      this.latchFault(info.fault);
    }
    return info;
  }

  async faultInfo(): Promise<EngineFaultInfo | null> {
    return this.faultValue ?? this.captureFault();
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
