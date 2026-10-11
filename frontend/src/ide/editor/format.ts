// A conservative "Format Document" for qpi.h / C++ contracts (Monaco has no built-in cpp formatter; TS uses its
// own). Whitespace-only and brace-depth driven, so it can never change what compiles: re-indent each code line
// to its brace depth, trim trailing whitespace, collapse blank-line runs. Comment/string-only lines are left
// as-is (their internal alignment is preserved) — we reuse the lint scanner's comment/string mask to count
// braces safely. Pure → unit-tested.
import { blankCommentsAndStrings } from "../qpi/lint/qpi-rules";

export function formatCode(source: string, lang: "cpp" | "typescript"): string {
  const unit = lang === "typescript" ? "  " : "    ";
  const masked = blankCommentsAndStrings(source); // braces inside comments/strings blanked, offsets preserved
  const srcLines = source.split("\n");
  const mLines = masked.split("\n");

  const out: string[] = [];
  let depth = 0;
  let blanks = 0;

  for (let i = 0; i < srcLines.length; i++) {
    const raw = srcLines[i];
    const trimmedRight = raw.replace(/\s+$/, "");
    const mTrim = (mLines[i] ?? "").trim();

    // No real code on this line (blank, or comment/string-only): preserve it (trailing-trimmed). Blank runs
    // collapse to a single blank.
    if (mTrim === "") {
      if (trimmedRight.trim() === "") {
        blanks++;
        if (blanks <= 1) {
          out.push("");
        }
      } else {
        blanks = 0;
        out.push(trimmedRight);
      }
      continue;
    }

    blanks = 0;
    const content = raw.trim();

    // Leading close-braces dedent this line itself (e.g. `}`, `};`, `} else {`).
    let lead = 0;
    for (const ch of mTrim) {
      if (ch === "}") {
        lead++;
      } else {
        break;
      }
    }
    const lineDepth = Math.max(0, depth - lead);
    out.push(unit.repeat(lineDepth) + content);

    // Net brace delta sets the indent for the following lines.
    let open = 0;
    let close = 0;
    for (const ch of mTrim) {
      if (ch === "{") {
        open++;
      } else if (ch === "}") {
        close++;
      }
    }
    depth = Math.max(0, depth + open - close);
  }

  return out.join("\n");
}
