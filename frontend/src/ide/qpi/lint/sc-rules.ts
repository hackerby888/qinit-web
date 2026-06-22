// Extra Tier-A static-analysis rules for the workspace analysis panel, beyond the vendored qpi-rules /
// native-types / idl-checks. These cover the smart-contract restrictions documented in qubic/core-lite
// doc/contracts.md that are statically detectable from source text but weren't yet flagged in-editor:
//
//   - Determinism: a contract runs on every computor and must reach the SAME result. Wall-clock time and
//     RNG diverge across nodes, so they're forbidden (use the on-chain tick/epoch time from `qpi`, and
//     derive any "randomness" from on-chain data).  (doc/contracts.md — determinism is the core invariant)
//   - No heap: contract memory is statically allocated; there is no `new`/`delete`/`malloc` heap.
//   - No exceptions / RTTI: the freestanding contract runtime has no exception tables or type info.
//   - No C++ standard library: only QPI types/containers are available (no `std::`).
//
// All rules are comment/string-aware (via blankCommentsAndStrings) and matched on a CALL/keyword shape so
// identifiers like `timestamp`, `renew`, `freedom`, or `mystd` don't false-positive. Advisory ("warn"),
// matching the rest of Tier-A — the backend clang compile is the authoritative error.
import { blankCommentsAndStrings, type QpiFinding } from "./qpi-rules";

interface ScRule {
  rule: string;
  re: RegExp; // global + `d` flag; capture group 1 is the exact span to flag
  message: string;
}

const RANDOM = "RNG is non-deterministic across computors — derive any randomness from on-chain data (tick, transaction digests), never `rand`/`random`.";
const TIME = "Wall-clock time is non-deterministic across computors — use the on-chain time from `qpi` (tick / epoch), not `time`/`clock`.";
const HEAP = "Dynamic memory is forbidden — a contract has no heap. Keep all state in `StateData` and use QPI containers (`Array`, `HashMap`, …) instead of `new`/`malloc`.";
const EXC = "Exceptions are forbidden in a contract — there is no exception runtime. Return a status via the `_output` struct instead of `throw`/`try`/`catch`.";
const RTTI = "Run-time type info (`typeid` / `dynamic_cast`) is forbidden — the contract runtime carries no RTTI. Use compile-time types only.";
const STL = "The C++ standard library isn't available to a contract — use QPI types and containers (e.g. `Array<T, N>`, `HashMap`, `id`) instead of `std::`.";

const RULES: ScRule[] = [
  { rule: "qpi/no-random", re: /\b(rand|srand|random|srandom|drand48|rand_r)\s*\(/dg, message: RANDOM },
  { rule: "qpi/no-time", re: /\b(time|clock|gettimeofday|timespec_get|localtime|gmtime|mktime)\s*\(/dg, message: TIME },
  { rule: "qpi/no-dynamic-memory", re: /\b(new|delete)\b/dg, message: HEAP },
  { rule: "qpi/no-dynamic-memory", re: /\b(malloc|calloc|realloc|free)\s*\(/dg, message: HEAP },
  { rule: "qpi/no-exceptions", re: /\b(throw)\b/dg, message: EXC },
  { rule: "qpi/no-exceptions", re: /\b(try)\s*\{/dg, message: EXC },
  { rule: "qpi/no-exceptions", re: /\b(catch)\s*\(/dg, message: EXC },
  { rule: "qpi/no-rtti", re: /\b(typeid|dynamic_cast)\s*[(<]/dg, message: RTTI },
  { rule: "qpi/no-stl", re: /\b(std)\s*::/dg, message: STL },
];

// Scan a contract source for the extra determinism / freestanding-runtime violations. Pure; offsets map
// straight into the original source (comment/string bodies are blanked, preserving positions).
export function scanScRules(source: string): QpiFinding[] {
  const src = blankCommentsAndStrings(source);
  const out: QpiFinding[] = [];

  for (const { rule, re, message } of RULES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const [s, e] = m.indices![1];
      out.push({ rule, message, offset: s, length: e - s, severity: "warn" });
    }
  }

  out.sort((a, b) => a.offset - b.offset);
  return out;
}
