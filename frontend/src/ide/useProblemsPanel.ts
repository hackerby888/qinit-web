import { useState, type Dispatch, type SetStateAction } from "react";

// A workspace problem (a compiler / lint marker) shown in the bottom Problems panel.
export interface ProblemItem {
  severity: number; // monaco MarkerSeverity: 8 error, 4 warning, 2 info, 1 hint
  message: string;
  line: number;
  col: number;
  source: string;
  code: string;
}

// The bottom diagnostics panel: the problem list, whether the panel is open, and which tab (problems / analysis)
// is active. The shell's compile / auto-check effects fill `problems` via setProblems. Extracted from the Ide
// component.
export interface ProblemsPanel {
  problems: ProblemItem[];
  setProblems: Dispatch<SetStateAction<ProblemItem[]>>;
  problemsOpen: boolean;
  setProblemsOpen: Dispatch<SetStateAction<boolean>>;
  bottomTab: "problems" | "analysis";
  setBottomTab: Dispatch<SetStateAction<"problems" | "analysis">>;
}

export function useProblemsPanel(): ProblemsPanel {
  const [problems, setProblems] = useState<ProblemItem[]>([]);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<"problems" | "analysis">("problems");

  return { problems, setProblems, problemsOpen, setProblemsOpen, bottomTab, setBottomTab };
}
