// Open-file tabs over the editor (VSCode's editor tabs). The active file is always an open tab; a tab
// shows a dirty dot when its source has edits not yet built, and a close ✕ on hover. The last tab can't
// be closed — the editor always needs an active file.
import { color, font } from "../ui/tokens";
import { hair } from "./chrome";
import { fileLabel } from "./workspace/filetree";

export function EditorTabs({ tabs, active, dirty, onSelect, onClose }: {
  tabs: string[];
  active: string;
  dirty: (name: string) => boolean;
  onSelect: (name: string) => void;
  onClose: (name: string, e: { stopPropagation(): void }) => void;
}) {
  return (
    <div className="pix-tabs" style={{ display: "flex", height: 36, flex: "none", borderBottom: hair(), background: color.panelDeep, overflowX: "auto", overflowY: "hidden" }}>
      {tabs.map((name) => {
        const on = name === active;
        const d = dirty(name);
        return (
          <div
            key={name}
            className="pix-tab"
            onClick={() => onSelect(name)}
            onMouseDown={(e) => { if (e.button === 1) { onClose(name, e); } }}
            title={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 10px",
              flex: "none",
              maxWidth: 200,
              cursor: "pointer",
              borderRight: `1px solid ${color.hair}`,
              borderBottom: on ? `2px solid ${color.accent}` : "2px solid transparent",
              background: on ? color.panel : "transparent",
              color: on ? color.accent : color.textMutedDk,
              fontFamily: font.mono,
              fontSize: 12,
            }}
          >
            <span style={{ width: 7, height: 7, flex: "none", background: on ? color.accent : color.textGhostDk }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileLabel(name)}</span>
            <span style={{ position: "relative", width: 14, height: 14, flex: "none" }}>
              {d && (
                <span className="pix-tab-dot" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: color.yellow, fontSize: 10 }}>●</span>
              )}
              <button
                className="pix-tab-x"
                onClick={(e) => onClose(name, e)}
                title="Close"
                style={{ position: "absolute", inset: 0, border: "none", background: "transparent", color: color.textGhostDk, cursor: "pointer", fontFamily: font.mono, fontSize: 14, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
