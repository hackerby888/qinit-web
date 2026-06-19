// Run compiled contracts in the page via @qinit/engine's InProcessEngine — byte-identical to the node.
//   function (read)  -> querySmartContract (no signing)
//   procedure (write)-> a signed tx (K12 + the engine's faucet seed) -> broadcastTx -> advanceTick
// One IdeEngine instance backs an IDE session; deploy() (re)loads a contract into its slot.
import { InProcessEngine, initK12 } from "@qinit/engine";
import { encodeInput, encodeInputJson, decodeOutput, contractAddress } from "@qinit/proto";
import { buildSignedTx } from "@qinit/core";
import type { ContractIdl, IdlEntry } from "@qinit/build/idl";

// A submitted tx lands a few ticks ahead — the auto-ticker processes it when the chain reaches it.
const TICKS_AHEAD = 3;

interface PendingTx {
  targetTick: number;
  bytes: Uint8Array;
  name: string;
  key: string;
}

export interface TxProcessed {
  key: string;
  name: string;
  tick: number;
  moneyFlew: boolean;
}

export class IdeEngine {
  private engine = new InProcessEngine();
  private seed: string | null = null;
  private k12Ready = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private mempool: PendingTx[] = [];

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
        const r = await this.engine.broadcastTx(t.bytes);
        this.onTxProcessed?.({ key: t.key, name: t.name, tick: info.tick, moneyFlew: !!r.moneyFlew });
      }
    }

    this.onTick?.(info);
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
  async submitProcedure(slot: number, procId: string, entry: IdlEntry, input: Record<string, unknown>, key: string): Promise<{ targetTick: number }> {
    await this.ensureSigner();

    const payload = entry.inFields.length ? await encodeInputJson(entry.inFields, input) : await encodeInput("");
    const ti = await this.engine.tickInfo();
    const targetTick = ti.tick + TICKS_AHEAD;

    const tx = await buildSignedTx(this.seed!, {
      destination: contractAddress(slot),
      amount: 0,
      tick: targetTick,
      inputType: Number(procId),
      payload,
    });

    this.mempool.push({ targetTick, bytes: tx.bytes, name: entry.name, key });
    return { targetTick };
  }

  // Current in-process engine time (advances explicitly on invoke/advanceTick).
  async info(): Promise<{ tick: number; epoch: number }> {
    return this.engine.tickInfo();
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
