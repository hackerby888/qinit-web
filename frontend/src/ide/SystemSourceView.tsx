// Read-only source viewer for a built-in system contract, opened by Ctrl+click on a chip in the
// SYSTEM CONTRACTS picker. The source is what the in-browser compiler builds when the contract is
// toggled on — shown in a read-only Monaco surface (same C++/QPI grammar + theme as the main
// editor), since system contracts aren't editable workspace files.
import { useEffect, useState, type CSSProperties } from "react";
import { Copy, Check } from "lucide-react";
import { color, font } from "../ui/tokens";
import { Card } from "../ui/modals";
import { CodeEditor } from "./editor";

const line: CSSProperties = { fontFamily: font.mono, fontSize: 11.5 };

export function SystemSourceView({ name, index, source, theme, onClose }: {
  name: string;
  index: number;
  source: string;
  theme?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const lines = source.split("\n").length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = () => {
    void navigator.clipboard.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(980px, 96vw)" }}>
        <Card frame={color.accentDeep} shadow={6} faceStyle={{ display: "flex", flexDirection: "column", maxHeight: "86vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${color.hair}`, flex: "none" }}>
            <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
            <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>{name}</span>
            <span style={{ ...line, color: color.textGhostDk }}>system contract · slot {index} · {lines.toLocaleString("en-US")} lines · read-only</span>

            <button onClick={copy} title="Copy the source" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, border: `1px solid ${color.hair2}`, background: color.void, color: copied ? color.accent : color.textLight, ...line, fontSize: 10.5, padding: "3px 8px", cursor: "pointer" }}>
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "copied" : "copy"}
            </button>
            <button onClick={onClose} style={{ border: `1px solid ${color.hair2}`, background: color.void, color: color.textLight, ...line, padding: "2px 8px", cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ height: "72vh" }}>
            <CodeEditor value={source} path={`system/${name}.h`} theme={theme} readOnly onChange={() => undefined} />
          </div>
        </Card>
      </div>
    </div>
  );
}
