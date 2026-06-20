// VS Code / Remix-style overlay palette, reused for two modes: quick-open (Ctrl+P, lists workspace files)
// and the command palette (Ctrl+Shift+P, lists IDE actions). The parent builds the mode-specific items; this
// component owns the fuzzy filter, keyboard nav (↑/↓/Enter/Escape) and the matched-char highlight.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { color, font } from "../landing/tokens";
import { Card } from "./ui";

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string; // right-aligned secondary text (keybinding, path, …)
  run: () => void;
}

// Subsequence fuzzy match: every query char must appear in order in the text. Returns the matched indices
// (for highlighting) or null. Case-folded by the caller.
function fuzzy(query: string, text: string): number[] | null {
  const idx: number[] = [];
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) {
      idx.push(i);
      qi++;
    }
  }
  return qi === query.length ? idx : null;
}

// A contiguous early match ranks above a scattered one; an exact prefix wins outright.
function score(matched: number[], text: string, query: string): number {
  if (text.startsWith(query)) {
    return -1000;
  }
  const spread = matched.length ? matched[matched.length - 1] - matched[0] : 0;
  const start = matched.length ? matched[0] : 999;
  return start * 4 + spread;
}

const rowBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  cursor: "pointer",
  fontFamily: font.mono,
  fontSize: 12.5,
};

function Label({ text, matched }: { text: string; matched: number[] }) {
  const set = new Set(matched);
  return (
    <span style={{ color: color.textMutedDk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {[...text].map((ch, i) => (
        <span key={i} style={set.has(i) ? { color: color.accent, fontWeight: 700 } : undefined}>{ch}</span>
      ))}
    </span>
  );
}

export function CommandPalette({ items, placeholder, onClose }: { items: PaletteItem[]; placeholder: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      return items.map((it) => ({ it, matched: [] as number[] }));
    }
    const out: { it: PaletteItem; matched: number[]; rank: number }[] = [];
    for (const it of items) {
      const m = fuzzy(query, it.label.toLowerCase());
      if (m) {
        out.push({ it, matched: m, rank: score(m, it.label.toLowerCase(), query) });
      }
    }
    out.sort((a, b) => a.rank - b.rank);
    return out;
  }, [q, items]);

  useEffect(() => {
    setSel(0);
  }, [q]);

  // Keep the active row in view as it moves past the scroll edges.
  useEffect(() => {
    const row = listRef.current?.children[sel] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const pick = (i: number) => {
    const f = filtered[i];
    if (!f) {
      return;
    }
    onClose();
    f.it.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(sel);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000099", zIndex: 60, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 92vw)" }}>
        <Card frame={color.accentDeep} shadow={6} faceStyle={{ display: "flex", flexDirection: "column", maxHeight: "62vh" }}>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            spellCheck={false}
            style={{
              border: "none",
              borderBottom: `1px solid ${color.hair}`,
              background: color.void,
              color: color.textLightHi,
              fontFamily: font.mono,
              fontSize: 13.5,
              padding: "12px 14px",
              outline: "none",
              flex: "none",
            }}
          />
          <div ref={listRef} style={{ overflowY: "auto", padding: 4 }}>
            {filtered.length === 0 && (
              <div style={{ ...rowBase, color: color.textGhostDk, cursor: "default" }}>no matches</div>
            )}
            {filtered.map((f, i) => {
              const on = i === sel;
              return (
                <div
                  key={f.it.id}
                  onMouseMove={() => setSel(i)}
                  onClick={() => pick(i)}
                  style={{ ...rowBase, borderLeft: `3px solid ${on ? color.accent : "transparent"}`, background: on ? `${color.accent}14` : "transparent" }}
                >
                  <Label text={f.it.label} matched={f.matched} />
                  {f.it.hint && <span style={{ marginLeft: "auto", flex: "none", color: color.textGhostDk, fontSize: 11 }}>{f.it.hint}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
