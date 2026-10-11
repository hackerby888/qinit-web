import type { SplashStep } from "../ui/Splash";

export type StartupTaskStatus = "loading" | "done" | "error";

export interface IdeStartupState {
  projectReady: boolean;
  editorReady: boolean;
  compiler: StartupTaskStatus;
  engine: StartupTaskStatus;
}

export function ideStartupSteps(state: IdeStartupState): SplashStep[] {
  return [
    { label: "project files", status: state.projectReady ? "done" : "loading" },
    { label: "editor engine", status: state.editorReady ? "done" : state.projectReady ? "loading" : "pending" },
    { label: "Qinit compiler", status: state.compiler },
    { label: "virtual node", status: state.engine },
  ];
}

export function ideStartupPending(state: IdeStartupState): boolean {
  return ideStartupSteps(state).some((step) => step.status === "pending" || step.status === "loading");
}
