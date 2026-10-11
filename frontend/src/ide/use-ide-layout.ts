import { useEffect, useState } from "react";

// IDE layout state: the resizable panel sizes (explorer width, engine-panel width, console height), the left /
// right panel visibility, and the per-section fold map — each persisted to localStorage so the layout survives a
// reload. Extracted from the Ide shell so layout lives in one hook instead of a dozen useState + persist effects.
export interface IdeLayout {
  explorerW: number;
  setExplorerW: (n: number) => void;
  engineW: number;
  setEngineW: (n: number) => void;
  consoleH: number;
  setConsoleH: (n: number) => void;
  leftHidden: boolean;
  rightHidden: boolean;
  setLeftHidden: (v: boolean) => void;
  setRightHidden: (v: boolean) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  collapsed: Record<string, boolean>;
  toggleSection: (name: string) => void;
}

export function useIdeLayout(): IdeLayout {
  const [explorerW, setExplorerW] = useState(() => Number(localStorage.getItem("ide.explorerW")) || 210);
  const [engineW, setEngineW] = useState(() => Number(localStorage.getItem("ide.engineW")) || 340);
  const [consoleH, setConsoleH] = useState(() => Number(localStorage.getItem("ide.consoleH")) || 300);
  const [leftHidden, setLeftHidden] = useState(() => localStorage.getItem("ide.leftHidden") === "1");
  const [rightHidden, setRightHidden] = useState(() => localStorage.getItem("ide.rightHidden") === "1");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ide.sections") ?? "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("ide.explorerW", String(explorerW));
  }, [explorerW]);

  useEffect(() => {
    localStorage.setItem("ide.engineW", String(engineW));
  }, [engineW]);

  useEffect(() => {
    localStorage.setItem("ide.consoleH", String(consoleH));
  }, [consoleH]);

  useEffect(() => {
    localStorage.setItem("ide.leftHidden", leftHidden ? "1" : "0");
  }, [leftHidden]);

  useEffect(() => {
    localStorage.setItem("ide.rightHidden", rightHidden ? "1" : "0");
  }, [rightHidden]);

  useEffect(() => {
    localStorage.setItem("ide.sections", JSON.stringify(collapsed));
  }, [collapsed]);

  const toggleLeft = (): void => setLeftHidden((v) => !v);

  const toggleRight = (): void => setRightHidden((v) => !v);

  // Fold / unfold an engine-panel section (default open — an absent key means open).
  const toggleSection = (name: string): void => setCollapsed((c) => ({ ...c, [name]: !c[name] }));

  return { explorerW, setExplorerW, engineW, setEngineW, consoleH, setConsoleH, leftHidden, rightHidden, setLeftHidden, setRightHidden, toggleLeft, toggleRight, collapsed, toggleSection };
}
