// Context-aware QPI diagnostics — the rules the completion engine already gates on, surfaced as
// squiggles so a mistake is caught instead of silently un-completed. These need the enclosing entry
// (function vs procedure vs hook), which the lexical Tier-A scanners don't track. Pure (no Monaco) so it's
// unit-tested, and offsets map straight into the source. A correct contract produces zero findings.
import { enclosingEntry, isFunctionEntry, maskComments, QPI_API } from "./members";

export interface ContextFinding {
  rule: string;
  message: string;
  offset: number;
  length: number;
  severity: "error" | "warn";
}

// The mutating host methods (QpiContextProcedureCall) — not callable from a const function. Derived from
// the same table the completion + drift test use, so it can't silently drift from qpi.h.
const MUTATING_QPI = QPI_API.filter((m) => m.proc).map((m) => m.label);

export function scanContext(src: string): ContextFinding[] {
  const masked = maskComments(src); // don't flag occurrences inside comments / string literals
  const out: ContextFinding[] = [];

  // `state.mut()` inside a const function — a function can read state but not mutate it.
  const mutRe = /\bstate\s*\.\s*(mut)\s*\(/dg;
  let m: RegExpExecArray | null;
  while ((m = mutRe.exec(masked)) !== null) {
    const entry = enclosingEntry(src, m.index);
    if (entry && isFunctionEntry(entry.macro)) {
      const [s, e] = m.indices![1];
      out.push({
        rule: "qpi/mut-in-function",
        message: "A function is const — it can't mutate state. Use `state.get()`, or make this a PUBLIC_PROCEDURE.",
        offset: s,
        length: e - s,
        severity: "error",
      });
    }
  }

  // A mutating `qpi.*` call inside a const function — those live on the procedure context only.
  const qpiRe = new RegExp(`\\bqpi\\s*\\.\\s*(${MUTATING_QPI.join("|")})\\s*\\(`, "dg");
  while ((m = qpiRe.exec(masked)) !== null) {
    const entry = enclosingEntry(src, m.index);
    if (entry && isFunctionEntry(entry.macro)) {
      const [s, e] = m.indices![1];
      out.push({
        rule: "qpi/mutate-in-function",
        message: `qpi.${masked.slice(s, e)}() mutates and isn't available in a const function — only in a procedure.`,
        offset: s,
        length: e - s,
        severity: "error",
      });
    }
  }

  return out;
}
