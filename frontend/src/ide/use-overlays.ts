import { useState, type Dispatch, type SetStateAction } from "react";
import type { DebugStep } from "./engine/proxy";

// The IDE's transient overlays / dialogs — the step debugger, the Ctrl+P / Ctrl+Shift+P palette, the GitHub
// import/export dialog, the tx explorer, and the share dialog. Pure open/close UI state (no logic), extracted
// from the Ide shell.
export interface DebugView {
  steps: DebugStep[];
  title: string;
  onBack?: () => void;
}

export interface Overlays {
  debug: DebugView | null;
  setDebug: Dispatch<SetStateAction<DebugView | null>>;
  palette: "file" | "command" | null;
  setPalette: Dispatch<SetStateAction<"file" | "command" | null>>;
  github: "import" | "export" | null;
  setGithub: Dispatch<SetStateAction<"import" | "export" | null>>;
  showTxs: boolean;
  setShowTxs: Dispatch<SetStateAction<boolean>>;
  shareOpen: boolean;
  setShareOpen: Dispatch<SetStateAction<boolean>>;
}

export function useOverlays(): Overlays {
  const [debug, setDebug] = useState<DebugView | null>(null);
  const [palette, setPalette] = useState<"file" | "command" | null>(null);
  const [github, setGithub] = useState<"import" | "export" | null>(null);
  const [showTxs, setShowTxs] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  return { debug, setDebug, palette, setPalette, github, setGithub, showTxs, setShowTxs, shareOpen, setShareOpen };
}
