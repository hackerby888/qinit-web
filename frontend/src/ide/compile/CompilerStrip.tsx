// Identity of the in-browser TS compiler, from the worker's hello handshake: package version plus
// the core-lite commit its embedded QPI snapshot was generated from ("*" = dirty checkout). The
// full pin (snapshot hash, generator/protocol versions) lives in the hover tooltip. Not rendered
// when the worker is unavailable.
import type { CompilerInfo } from "@qinit/compiler/browser";
import { color, font } from "../../ui/tokens";
import { infoPopoverStyle } from "../chrome";

export function CompilerStrip({ info }: { info: CompilerInfo }) {
  const dirty = info.coreCommit.endsWith("-dirty");
  const commit = info.coreCommit.replace(/-dirty$/, "").slice(0, 8);

  return (
    <div className="pix-info-hover" tabIndex={0} aria-label="TS-QPI compiler details" style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, fontFamily: font.mono, fontSize: 11, color: color.textFaintDk, outline: "none" }}>
      <span style={{ color: color.textMutedDk, letterSpacing: ".14em" }}>TS-QPI</span>
      <span><span style={{ color: color.textGhostDk }}>v</span><span style={{ color: color.textMutedDk }}>{info.qinitVersion}</span></span>
      <span style={{ borderBottom: `1px dotted ${color.textGhostDk}` }}><span style={{ color: color.textGhostDk }}>core </span><span style={{ color: color.textMutedDk }}>{commit}{dirty ? "*" : ""}</span></span>
      <span className="pix-info-popover" role="tooltip" style={infoPopoverStyle(360)}>
        <span style={{ color: color.textLightHi }}>IN-BROWSER TS-QPI COMPILER</span>
        <span style={{ height: 1, background: color.hair2 }} />
        <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>qinit version</span><span>{info.qinitVersion}</span></span>
        <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>core commit</span><span>{info.coreCommit}</span></span>
        <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>snapshot</span><span style={{ maxWidth: 225, overflow: "hidden", textOverflow: "ellipsis" }}>{info.snapshotHash}</span></span>
        <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>generator</span><span>v{info.generatorVersion}</span></span>
        <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>protocol</span><span>v{info.protocolVersion}</span></span>
      </span>
    </div>
  );
}
