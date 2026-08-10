import { test, expect } from "bun:test";
import { IdeEngine } from "../../src/ide/engine";
import type { EngineRequest, EngineWorkerMessage } from "../../src/ide/engine-protocol";

class FakeWorker {
  onmessage: ((event: MessageEvent<EngineWorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly calls: EngineRequest[] = [];
  terminated = false;

  constructor(private readonly respond: boolean) {}

  postMessage(message: EngineRequest): void {
    this.calls.push(message);
    if (!this.respond) return;
    queueMicrotask(() => {
      const value = message.method === "callFunction" ? 42n
        : message.method === "callFunctionDetailed" ? { output: 42n, detail: { in: "(none)", out: "42", caller: "(none)", diff: [], hostCalls: [], logs: ["INFO CounterLog { value=42 }"], steps: [] } }
        : message.method === "runGtest" ? [{ name: "Counter.Expression", passed: true, message: "" }]
        : message.method === "info" ? { tick: 7, epoch: 1 }
          : message.method === "faultInfo" ? null
          : message.method === "assets" ? []
            : undefined;
      this.emit({ id: message.id, kind: "result", ok: true, value });
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: EngineWorkerMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<EngineWorkerMessage>);
  }
}

const workerAsBrowser = (worker: FakeWorker): Worker => worker as unknown as Worker;

test("browser IdeEngine sends contract execution to the worker", async () => {
  const worker = new FakeWorker(true);
  const engine = new IdeEngine({ workerFactory: () => workerAsBrowser(worker) });
  const entry = { name: "Get", in: "", out: "uint64", inFields: [], outFields: [{ name: "value", type: "uint64" }] };

  expect(await engine.callFunction(28, "1", entry, {})).toBe(42n);
  expect(worker.calls.map((call) => call.method)).toEqual(["callFunction"]);
});

test("browser IdeEngine sends the compiled gtest Wasm and target contracts to the worker", async () => {
  const worker = new FakeWorker(true);
  const engine = new IdeEngine({ workerFactory: () => workerAsBrowser(worker) });
  const program = { version: 2 as const, contract: "Counter", mainSlot: 28, runnerSlot: 65534, tests: [{ name: "Counter.Expression", inputType: 1 }] };

  const result = await engine.runGtest(program, Uint8Array.of(1, 2), { 28: Uint8Array.of(3, 4) });
  expect(result[0]?.passed).toBe(true);
  expect(worker.calls[0]?.method).toBe("runGtest");
  expect(worker.calls[0]?.args).toEqual([program, Uint8Array.of(1, 2), { 28: Uint8Array.of(3, 4) }]);
});

test("browser IdeEngine returns function logs from the worker", async () => {
  const worker = new FakeWorker(true);
  const engine = new IdeEngine({ workerFactory: () => workerAsBrowser(worker) });
  const entry = { name: "Get", in: "", out: "uint64", inFields: [], outFields: [{ name: "value", type: "uint64" }] };

  const result = await engine.callFunctionDetailed(28, "1", entry, {});
  expect(result.output).toBe(42n);
  expect(result.detail?.logs).toEqual(["INFO CounterLog { value=42 }"]);
  expect(worker.calls.map((call) => call.method)).toEqual(["callFunctionDetailed"]);
});

test("worker events update tick, transaction, log, and synchronous asset mirrors", () => {
  const worker = new FakeWorker(true);
  const engine = new IdeEngine({ workerFactory: () => workerAsBrowser(worker) });
  const ticks: number[] = [];
  const transactions: string[] = [];
  const logs: string[] = [];
  const memories: number[] = [];
  engine.onTick = (event) => ticks.push(event.tick);
  engine.onTxProcessed = (event) => transactions.push(event.key);
  engine.onLog = (event) => logs.push(event.msg);
  engine.onMemory = (event) => memories.push(event.linearMemoryBytes);

  worker.emit({ kind: "event", event: "tick", value: { tick: 9, epoch: 2 } });
  worker.emit({
    kind: "event",
    event: "transaction",
    value: { key: "Counter:p:1", name: "Inc", tick: 9, moneyFlew: false },
    assets: [{ issuer: "A".repeat(60), name: "COUNTER", decimals: 0, unit: "", totalShares: "676", holdings: [] }],
  });
  worker.emit({ kind: "event", event: "log", value: { level: "info", tick: 9, cat: "test", msg: "done" } });
  worker.emit({ kind: "event", event: "memory", value: { linearMemoryBytes: 67_305_472, stateBytes: 8, contractCount: 1 } });

  expect(ticks).toEqual([9]);
  expect(transactions).toEqual(["Counter:p:1"]);
  expect(logs).toEqual(["done"]);
  expect(memories).toEqual([67_305_472]);
  expect(engine.assets()[0].name).toBe("COUNTER");
  expect(engine.memoryUsage()).toEqual({ linearMemoryBytes: 67_305_472, stateBytes: 8, contractCount: 1 });
});

test("a semantic fault stops the session without restarting its worker", async () => {
  const worker = new FakeWorker(true);
  const engine = new IdeEngine({ workerFactory: () => workerAsBrowser(worker) });
  const fault = {
    message: "integer divide by zero",
    phase: "transaction",
    failedTick: 9,
    failedEpoch: 1,
    lastFinalizedTick: 8,
    lastFinalizedEpoch: 1,
    slot: 28,
    kind: 1,
    entry: 2,
    txId: "deadbeef",
  };
  const faults: typeof fault[] = [];
  engine.onFault = (value) => faults.push(value as typeof fault);
  engine.start();

  worker.emit({ kind: "event", event: "fault", value: fault });
  worker.emit({ kind: "event", event: "fault", value: { ...fault, message: "later fault" } });
  engine.resume();

  expect(engine.isRunning()).toBe(false);
  expect(faults).toEqual([fault]);
  expect(await engine.faultInfo()).toEqual(fault);
  expect(worker.calls.some((call) => call.method === "resume")).toBe(false);
  expect(() => engine.fundAccount("A".repeat(60), 1n)).toThrow("virtual node faulted");
  await expect(engine.replay([])).rejects.toThrow("virtual node faulted");
  expect(worker.terminated).toBe(false);

  await engine.reset([]);
  expect(engine.isRunning()).toBe(true);
  expect(await engine.faultInfo()).toBeNull();
});

test("a timed-out call terminates the wedged worker and restores a fresh one", async () => {
  const workers: FakeWorker[] = [];
  const engine = new IdeEngine({
    timeoutMs: 10,
    workerFactory: () => {
      const worker = new FakeWorker(workers.length > 0);
      workers.push(worker);
      return workerAsBrowser(worker);
    },
  });
  const entry = { name: "Get", in: "", out: "uint64", inFields: [], outFields: [{ name: "value", type: "uint64" }] };

  await expect(engine.callFunction(28, "1", entry, {})).rejects.toThrow(/timed out.*worker restarted/);
  expect(workers[0].terminated).toBe(true);
  expect((await engine.info()).tick).toBe(7);
  expect(workers.length).toBe(2);
});

test("a disposed engine cannot restart its worker", async () => {
  const workers: FakeWorker[] = [];
  const engine = new IdeEngine({
    workerFactory: () => {
      const worker = new FakeWorker(true);
      workers.push(worker);
      return workerAsBrowser(worker);
    },
  });

  engine.dispose();

  await expect(engine.info()).rejects.toThrow("virtual node disposed");
  expect(workers).toHaveLength(1);
  expect(workers[0].terminated).toBe(true);
});
