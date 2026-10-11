// the thread a test file runs on. Chain calls go to the page over messages; the page can end a run that never
// returns by terminating this worker, which it could not do while tests ran on its own thread.
/// <reference lib="webworker" />
import { runSandbox, type SandboxBridge } from "./sandbox";
import type { TestWorkerReply, TestWorkerRequest } from "./runner";

let sequence = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const post = (message: TestWorkerRequest): void => self.postMessage(message);

const call = <T>(method: keyof SandboxBridge, args: unknown[]): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve: (value) => resolve(value as T), reject });
    post({ kind: "call", id, method, args });
  });

const bridge: SandboxBridge = {
  callFunction: (contract, fnId, input) => call("callFunction", [contract, fnId, input]),
  submitProcedure: (contract, procId, input, options) => call("submitProcedure", [contract, procId, input, options]),
  reset: () => call("reset", []),
};

// a rejected promise no test awaited: held here until the running test finishes, which then fails with it.
const stray: string[] = [];
self.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  stray.push(event.reason instanceof Error ? event.reason.message : String(event.reason));
});

self.onmessage = (event: MessageEvent<TestWorkerReply>) => {
  const message = event.data;
  if (message.kind === "reply") {
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    if (message.ok) waiting?.resolve(message.value);
    else waiting?.reject(new Error(message.error ?? "the call failed"));
    return;
  }
  void runSandbox(message.js, message.contracts, bridge, (sandboxEvent) => post({ kind: "event", event: sandboxEvent }), () => stray.splice(0));
};
