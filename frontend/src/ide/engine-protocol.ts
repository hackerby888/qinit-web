// Structured-clone protocol between the React-side IdeEngine proxy and the worker that owns VirtualNode.
import type { AssetView, EngineMemoryUsage, TxProcessed } from "./engine-core";
import type { EngineLogEvent } from "@qinit/engine";

export type EngineMethod =
  | "deploy" | "runGtest"
  | "start" | "stop" | "isRunning" | "pause" | "resume" | "setSpeed" | "speed"
  | "step" | "epochLength" | "advanceEpoch" | "fundAccount"
  | "reset" | "replay" | "runSteps" | "exportHistory" | "registerSource"
  | "stateOf" | "assets" | "callFunction" | "callFunctionDetailed" | "submitProcedure"
  | "info" | "ensureAccounts" | "restoreAccounts" | "balanceOf" | "addressOf";

export interface EngineRequest {
  id: number;
  kind: "call";
  method: EngineMethod;
  args: unknown[];
}

export interface EngineResponse {
  id: number;
  kind: "result";
  ok: boolean;
  value?: unknown;
  error?: string;
}

export type EngineEvent =
  | { kind: "event"; event: "tick"; value: { tick: number; epoch: number } }
  | { kind: "event"; event: "transaction"; value: TxProcessed; assets: AssetView[] }
  | { kind: "event"; event: "memory"; value: EngineMemoryUsage }
  | { kind: "event"; event: "log"; value: EngineLogEvent };

export type EngineWorkerMessage = EngineResponse | EngineEvent;
