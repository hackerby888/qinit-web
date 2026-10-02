import { Chip, NotchBox } from "./components";
import { color, font } from "./tokens";
import { IDE_FIRST_LINE, IDE_LINE_COUNT, IDE_SEG, IDE_TREE } from "./content";
import { Segments, VoteDots } from "./illustrations";

// what the engine panel shows after one Inc and one Get on the starter contract.
const STATS: [string, string, boolean][] = [
  ["contract", "Counter", false],
  ["Inc()", "processed ✓", true],
  ["Get()", "1", true],
  ["state", "counter 1", false],
];

export function IdeShowcase() {
  return (
    <section id="ide" style={{ background: color.void, color: color.textLight, padding: "64px 32px 70px", borderTop: `3px solid ${color.ink}`, borderBottom: `3px solid ${color.ink}`, backgroundImage: "radial-gradient(#19E0B40d 1.5px, transparent 1.5px)", backgroundSize: "9px 9px" }}>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 38 }}>
          <Chip tone="panel">
            <span style={{ width: 8, height: 8, background: color.accent }} /> Browser-based IDE
          </Chip>
          <h2 style={{ fontFamily: font.display, margin: "18px 0 10px", fontSize: 42, fontWeight: 600, color: color.textLightHi }}>Write, test, deploy — all in your browser.</h2>
          <p style={{ margin: "0 auto", maxWidth: 580, fontSize: 17, lineHeight: 1.6, color: color.textMutedDk }}>
            A full IDE with the Qubic <span style={{ color: color.accent }}>contract engine built in</span>. Your contract compiles and runs in the page, with the same compiler and engine as the CLI. No installs, no setup.
          </p>
        </div>

        <NotchBox frame={color.accentDeep} face={color.panel} shadow={8} lift={false} style={{ filter: `drop-shadow(8px 8px 0 ${color.accentShadow})` }} faceStyle={{ overflow: "hidden" }}>
          {/* title bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", borderBottom: `3px solid ${color.hair}`, background: color.panelDeep }}>
            <span style={{ width: 11, height: 11, background: color.accent }} />
            <span style={{ width: 11, height: 11, background: color.swatchOff }} />
            <span style={{ width: 11, height: 11, background: color.swatchOff }} />
            <span style={{ fontFamily: font.mono, fontSize: 12, marginLeft: 8, color: color.textFaintDk }}>qinit ide — counter</span>
            <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>ide.qinit.dev</span>
          </div>

          {/* body: file tree | editor | engine panel */}
          <div className="pix-ide-body" style={{ display: "grid", gridTemplateColumns: "188px 1fr 230px", minHeight: 340 }}>
            <div className="pix-ide-tree" style={{ borderRight: `3px solid ${color.hair}`, padding: "16px 0", fontFamily: font.mono, fontSize: 12.5, color: color.textMutedDk }}>
              <div style={{ padding: "0 16px 10px", color: color.textGhostDk, letterSpacing: ".1em", fontSize: 10.5 }}>EXPLORER</div>
              {IDE_TREE.map((t) => (
                <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 16px", paddingLeft: t.pad, background: t.active ? `${color.accent}1a` : "transparent", color: t.color }}>
                  <span style={{ width: 8, height: 8, flex: "none", background: t.dot }} />{t.label}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", fontFamily: font.mono, fontSize: 13, lineHeight: 1.85, borderRight: `3px solid ${color.hair}`, overflow: "hidden" }}>
              <div style={{ padding: "16px 12px 16px 16px", color: "#3D443E", textAlign: "right", userSelect: "none", background: "#0C0F0D" }}>
                {Array.from({ length: IDE_LINE_COUNT }, (_, i) => <div key={i}>{IDE_FIRST_LINE + i}</div>)}
              </div>
              <pre style={{ margin: 0, padding: 16, color: "#C9D1CB", overflowX: "auto" }}><Segments segs={IDE_SEG} /></pre>
            </div>

            <div className="pix-ide-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".1em", color: color.textGhostDk }}>ENGINE</div>
              <VoteDots count={52} cols={13} seed={11} dur={2.2} />
              <div style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textMutedDk, lineHeight: 1.7 }}>
                {STATS.map(([k, v, hot]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: color.textGhostDk }}>{k}</span>
                    <span style={{ color: hot ? color.accent : color.textMutedDk }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "auto", background: color.accent, color: color.void, fontFamily: font.display, fontSize: 15, textAlign: "center", padding: 9, border: `3px solid ${color.ink}` }}>▶ Compile</div>
            </div>
          </div>

          {/* status bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 16px", borderTop: `3px solid ${color.hair}`, background: color.panelDeep, fontFamily: font.mono, fontSize: 11, color: color.textFaintDk }}>
            <span style={{ color: color.accent }}>● ready</span>
            <span>Counter.h</span>
            <span>C++ (QPI)</span>
            <span style={{ marginLeft: "auto" }}>✓ compiled in 0.6s</span>
          </div>
        </NotchBox>
      </div>
    </section>
  );
}
