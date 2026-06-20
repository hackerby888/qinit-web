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

export interface TxDetail {
  in: string;
  out: string;
  caller: string;
  diff: { label: string; before: string; after: string }[];
  hostCalls: string[];
  logs: string[];
}

export interface TxProcessed {
  key: string;
  name: string;
  tick: number;
  moneyFlew: boolean;
  detail?: TxDetail;
}

export class IdeEngine {
  private engine = new InProcessEngine();
  private seed: string | null = null;
  private k12Ready = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private mempool: PendingTx[] = [];
  private accounts: Account[] = [];

  onTick: ((info: { tick: number; epoch: number }) => void) | null = null;
  onTxProcessed: ((e: TxProcessed) => void) | null = null;

  // Deploy constructs the contract (INITIALIZE) and digests its state, so K12 must be ready first.
  async deploy(slot: number, wasm: Uint8Array, idl: ContractIdl): Promise<void> {
    await this.ensureK12();
    this.engine.deploy(slot, wasm, idl.name);
  }

  // Emulate the live network: advance one tick per second. Each tick runs the contracts' BEGIN/END_TICK
  // hooks, then any mempool tx whose target tick has arrived is processed — its SC invocation runs now.
  start(): void {
    if (this.ticker) {
      return;
    }
    void this.engine.setDebug(true); // capture per-tx debug traces for the inspector
    this.ticker = setInterval(() => {
      void this.tick();
    }, 1000);
  }

  stop(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private async tick(): Promise<void> {
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

    this.onTick?.(info);
  }

  // Decode the just-processed tx (debug entries added since `base`) into the inspector view — decoded
  // in/out, caller, named StateData diff, and contract logs. Reuses the CLI's trace decoder; never throws.
  private async traceOf(base: number, t: PendingTx): Promise<TxDetail | undefined> {
    try {
      const entries = (await this.engine.debugTrace()).entries.slice(base);
      const e = entries.find((x) => x.kind === 1) ?? entries[entries.length - 1];
      if (!e) {
        return undefined;
      }
      const tv = await describeTrace(e, t.contractSource, t.contractName, this.engine);
      return {
        in: tv.inDecoded,
        out: tv.outDecoded,
        caller: tv.caller,
        diff: e.stateDiff.map((d) => ({ label: labelOff(tv.fields, d.off), before: fmtDiffVal(tv.fields, d.off, d.before), after: fmtDiffVal(tv.fields, d.off, d.after) })),
        hostCalls: e.hostCalls.map((h) => `${h.name} ${h.detail}`),
        logs: tv.logs.map((l) => fmtLog(l)),
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
