// Run compiled contracts in the page via @qinit/engine's InProcessEngine — byte-identical to the node.
//   function (read)  -> querySmartContract (no signing)
//   procedure (write)-> a signed tx (K12 + the engine's faucet seed) -> broadcastTx -> advanceTick
// One IdeEngine instance backs an IDE session; deploy() (re)loads a contract into its slot.
import { InProcessEngine, initK12 } from "@qinit/engine";
import { encodeInput, encodeInputJson, decodeOutput, contractAddress } from "@qinit/proto";
import { buildSignedTx, deriveIdentity, identityToBytes, bytesToIdentity } from "@qinit/core";
import type { ContractIdl, IdlEntry } from "@qinit/build/idl";
import { readState, describeTrace, labelOff, fmtDiffVal, fmtLog, type StateDump } from "@qinit/inspector";

// A submitted tx lands a few ticks ahead — the auto-ticker processes it when the chain reaches it.
const TICKS_AHEAD = 3;

const randomSeed = (): string =>
  Array.from({ length: 55 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

export interface Account {
  seed: string;
  id: string;
}

interface PendingTx {
  targetTick: number;
  bytes: Uint8Array;
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
  label: string; // human label, e.g. "procedure #1" or "BEGIN_TICK"
  ok: boolean;
  caller: string;
  in: string;
  out: string;
  diff: { label: string; before: string; after: string }[];
  hostCalls: string[];
  logs: string[];
}

export interface TxDetail {
  in: string;
  out: string;
  caller: string;
  diff: { label: string; before: string; after: string }[];
  hostCalls: string[];
  logs: string[];
  steps: DebugStep[]; // the whole call sequence, for the step debugger
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

export class IdeEngine {
  private engine = new InProcessEngine();
  private seed: string | null = null;
  private k12Ready = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private mempool: PendingTx[] = [];
  private accounts: Account[] = [];
  private speedMs = 1000;
  private history: ReplayStep[] = []; // every applied write this session, for replay
  private contractSources = new Map<number, { source: string; name: string }>(); // slot -> source, for per-step trace decoding

  onTick: ((info: { tick: number; epoch: number }) => void) | null = null;
  onTxProcessed: ((e: TxProcessed) => void) | null = null;

  // Deploy constructs the contract (INITIALIZE) and digests its state, so K12 must be ready first.
  async deploy(slot: number, wasm: Uint8Array, idl: ContractIdl): Promise<void> {
    await this.ensureK12();
    this.engine.deploy(slot, wasm, idl.name);
  }

  // Emulate the live network: advance one tick per `speedMs`. Each tick runs the contracts' BEGIN/END_TICK
  // hooks, then any mempool tx whose target tick has arrived is processed — its SC invocation runs now.
  start(): void {
    if (this.ticker) {
      return;
    }
    void this.engine.setDebug(true); // capture per-tx debug traces for the inspector
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
      await this.tickOnce(i === n - 1);
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
  // INITIALIZE), the same dev accounts re-funded, tick/epoch back to 0, mempool + history cleared.
  async reset(images: DeployImage[]): Promise<void> {
    this.stop();
    await this.ensureK12();
    this.engine = new InProcessEngine();
    void this.engine.setDebug(true);
    this.mempool = [];
    this.history = [];

    for (const img of [...images].sort((a, b) => a.slot - b.slot)) {
      this.engine.deploy(img.slot, img.wasm, img.name);
    }
    await this.reseedAccounts();
    this.start();
  }

  // Reset to genesis, then re-apply every write this session in order — each landed on its own ticks, so
  // ordering is preserved. Reproduces the exact state from a clean chain.
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
      await this.step(TICKS_AHEAD + 1); // tick until it lands
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

    const due = this.mempool.filter((t) => info.tick >= t.targetTick);
    if (due.length) {
      this.mempool = this.mempool.filter((t) => info.tick < t.targetTick);
      for (const t of due) {
        const base = (await this.engine.debugTrace()).entries.length;
        const r = await this.engine.broadcastTx(t.bytes);
        const detail = await this.traceOf(base, t);
        this.onTxProcessed?.({ key: t.key, name: t.name, tick: info.tick, moneyFlew: !!r.moneyFlew, detail });
      }
    }

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
  private async traceOf(base: number, t: PendingTx): Promise<TxDetail | undefined> {
    try {
      const entries = (await this.engine.debugTrace()).entries.slice(base);
      if (!entries.length) {
        return undefined;
      }

      const steps: DebugStep[] = [];
      for (const e of entries) {
        const src = this.contractSources.get(e.index) ?? { source: t.contractSource, name: t.contractName };
        const tv = await describeTrace(e, src.source, src.name, this.engine);
        steps.push({
          seq: e.seq,
          slot: e.index,
          contract: src.name,
          kind: e.kind,
          label: stepLabel(e.kind, e.entry),
          ok: e.ok,
          caller: tv.caller,
          in: tv.inDecoded,
          out: tv.outDecoded,
          diff: e.stateDiff.map((d) => ({ label: labelOff(tv.fields, d.off), before: fmtDiffVal(tv.fields, d.off, d.before), after: fmtDiffVal(tv.fields, d.off, d.after) })),
          hostCalls: e.hostCalls.map((h) => `${h.name} ${h.detail}`),
          logs: tv.logs.map((l) => fmtLog(l)),
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

  // Decode a deployed contract's CURRENT state (scalars + container columns) — the qinit `state` inspector.
  async stateOf(slot: number, source: string, name: string): Promise<StateDump> {
    return readState(this.engine, slot, source, name);
  }

  // Read a function's output. No crypto — a direct query against the deployed wasm.
  async callFunction(slot: number, fnId: string, entry: IdlEntry, input: Record<string, unknown>): Promise<unknown> {
    const bytes = entry.inFields.length ? await encodeInputJson(entry.inFields, input) : await encodeInput("");
    const out = await this.engine.querySmartContract(slot, Number(fnId), bytes);
    return entry.out ? decodeOutput(out, entry.out) : null;
  }

  // Submit a procedure call as a signed tx into the mempool. NOT applied now — the auto-ticker
  // broadcasts it when the chain reaches its target tick, so the SC invocation runs during that tick
  // (like the real network). Returns the tick it will land on.
  async submitProcedure(slot: number, procId: string, entry: IdlEntry, input: Record<string, unknown>, key: string, caller: { seed: string; amount: number }, contract: { name: string; source: string }): Promise<{ targetTick: number }> {
    await this.ensureK12();

    const payload = entry.inFields.length ? await encodeInputJson(entry.inFields, input) : await encodeInput("");
    const ti = await this.engine.tickInfo();
    const targetTick = ti.tick + TICKS_AHEAD;

    const tx = await buildSignedTx(caller.seed, {
      destination: contractAddress(slot),
      amount: caller.amount,
      tick: targetTick,
      inputType: Number(procId),
      payload,
    });

    this.mempool.push({ targetTick, bytes: tx.bytes, name: entry.name, key, contractName: contract.name, contractSource: contract.source });
    this.history.push({ slot, procId, entry, input, key, caller, contract });
    return { targetTick };
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
