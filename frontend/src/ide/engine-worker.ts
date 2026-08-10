// Dedicated browser thread for the virtual node. Contract Wasm dispatch is synchronous, so keeping the
// VirtualNode and all of its mutable memory here is what prevents heavy calls from blocking React/Monaco.
/// <reference lib="webworker" />
import { IdeEngineCore } from "./engine-core";
import type { EngineRequest, EngineResponse, EngineWorkerMessage } from "./engine-protocol";

const engine = new IdeEngineCore();
const send = (message: EngineWorkerMessage): void => self.postMessage(message);
const sendMemory = (): void => send({ kind: "event", event: "memory", value: engine.memoryUsage() });

engine.onTick = (value) => {
  send({ kind: "event", event: "tick", value });
  sendMemory();
};
engine.onLog = (value) => send({ kind: "event", event: "log", value });
engine.onFault = (value) => send({ kind: "event", event: "fault", value });
engine.onTxProcessed = (value) => send({ kind: "event", event: "transaction", value, assets: engine.assets() });

async function handle(request: EngineRequest): Promise<void> {
  const response: EngineResponse = { id: request.id, kind: "result", ok: false };
  try {
    const target = engine as unknown as Record<string, (...args: unknown[]) => unknown>;
    const method = target[request.method];
    if (typeof method !== "function") throw new Error(`unknown engine method '${request.method}'`);
    response.value = await method.apply(engine, request.args);
    response.ok = true;
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error);
  }
  sendMemory();
  send(response);
}

// Serialize every command. This preserves node ordering even if React requests a state refresh while another
// call is pending. A synchronous Wasm dispatch blocks only this worker's queue, never the browser UI thread.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<EngineRequest>) => {
  if (event.data.kind !== "call") return;
  queue = queue.then(() => handle(event.data), () => handle(event.data));
};
