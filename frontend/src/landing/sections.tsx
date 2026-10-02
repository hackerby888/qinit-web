import { type CSSProperties, type ReactNode } from "react";
import { Chip, GlyphBadge, NotchBox, PixelButton, PixelQMark } from "./components";
import { color, font } from "./tokens";
import { CHIPS, FEATURES, IDE_URL, NAV, PATH, PILLARS, REPO, TYPE_SEG } from "./content";
import { DotField, Typewriter, VoteDots, VoxelStack } from "./illustrations";

const wrap: CSSProperties = { maxWidth: 1140, margin: "0 auto" };
const dotGrid = (dark: boolean): CSSProperties => ({
  backgroundImage: `radial-gradient(${dark ? "#19E0B40d" : "#16190F0d"} 1.5px, transparent 1.5px)`,
  backgroundSize: dark ? "9px 9px" : "8px 8px",
});
const h2: CSSProperties = { fontFamily: font.display, fontWeight: 600, fontSize: 42, margin: 0, color: color.ink };

function CheckRow({ children, tint = color.accent }: { children: ReactNode; tint?: string }) {
  return (
    <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
      <span style={{ width: 16, height: 16, background: tint, border: `2px solid ${color.ink}`, flex: "none" }} />
      <span style={{ fontSize: 15 }}>{children}</span>
    </div>
  );
}

// the 6-computor ring glyph next to the wordmark.
function RingGlyph() {
  const pts = [[7, 2], [11.3, 4.5], [11.3, 9.5], [7, 12], [2.7, 9.5], [2.7, 4.5]];
  return (
    <svg viewBox="0 0 14 14" width="12" height="12">
      {pts.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="1.4" fill={color.accent} />)}
    </svg>
  );
}

export function Nav() {
  return (
    <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 32px", borderBottom: `3px solid ${color.accent}`, background: color.void, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <PixelQMark size={22} />
        <span style={{ fontFamily: font.display, fontSize: 25, fontWeight: 600, color: color.textLightHi }}>qinit</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".12em", color: color.textFaintDk, borderLeft: `1px solid ${color.hair2}`, paddingLeft: 13, marginLeft: 3 }}>
          <RingGlyph /> BUILT FOR QUBIC
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 26, fontSize: 15, fontWeight: 500, color: "#C9D1CB" }}>
        {NAV.map((n) => <a key={n.label} href={n.href} className="nav-link">{n.label}</a>)}
        <PixelButton href={REPO} onDark style={{ marginLeft: 4 }}>Get started</PixelButton>
      </div>
    </nav>
  );
}

export function Hero() {
  return (
    <header style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 32px", overflow: "hidden", background: color.void, color: color.textLight, borderBottom: `3px solid ${color.ink}`, ...dotGrid(true) }}>
      <DotField />
      <div style={{ position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)", width: 680, height: 520, borderRadius: "50%", background: `radial-gradient(circle, ${color.accent}14 0%, transparent 66%)`, pointerEvents: "none" }} />

      <div className="pix-hero-grid" style={{ position: "relative", ...wrap, display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 48, alignItems: "center" }}>
        <div>
          <Chip tone="panel" style={{ marginBottom: 28 }}>
            <span style={{ width: 9, height: 9, background: color.accent }} /> FRAMEWORK + BROWSER IDE
          </Chip>
          <h1 style={{ fontFamily: font.body, margin: "0 0 22px", fontSize: 56, lineHeight: 1.06, fontWeight: 600, color: color.textLightHi }}>
            A <span style={{ color: color.accent }}>framework</span> and an <span style={{ color: color.accent }}>IDE</span> for Qubic smart contracts.
          </h1>
          <p style={{ margin: "0 0 30px", maxWidth: 500, fontSize: 18, lineHeight: 1.65, color: color.textMutedDk }}>
            qinit is two tools in one: a CLI that builds, tests, and deploys Qubic contracts from your terminal, and an IDE that does the same in your browser.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 30 }}>
            <PixelButton href="#ways" onDark>Start building →</PixelButton>
            <PixelButton href="/docs" variant="dark" onDark>Read the docs</PixelButton>
          </div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", fontFamily: font.mono, fontSize: 11.5, color: color.textMutedDk }}>
            {CHIPS.map((c) => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${color.hair2}`, padding: "6px 11px" }}>
                <span style={{ width: 7, height: 7, background: color.accent }} />{c}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <VoxelStack />
        </div>
      </div>

      {/* install terminal */}
      <div style={{ position: "relative", maxWidth: 520, margin: "46px auto 0" }}>
        <NotchBox frame={color.accentDeep} face={color.panel} shadow={6} lift={false} style={{ filter: `drop-shadow(6px 6px 0 ${color.accentShadow})` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderBottom: `3px solid ${color.hair}`, background: color.panelDeep }}>
            <span style={{ width: 11, height: 11, background: color.accent }} />
            <span style={{ width: 11, height: 11, background: color.swatchOff }} />
            <span style={{ width: 11, height: 11, background: color.swatchOff }} />
            <span style={{ fontFamily: font.mono, fontSize: 12, marginLeft: 6, color: color.textFaintDk }}>terminal</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", fontFamily: font.mono, fontSize: 14.5, color: "#C9D1CB" }}>
            <span><span style={{ color: color.textGhostDk }}>$</span> qinit new <span style={{ color: color.accent }}>counter</span></span>
            <span style={{ display: "inline-block", width: 9, height: 17, background: color.accent, animation: "qblink 1.1s steps(1) infinite" }} />
          </div>
        </NotchBox>
      </div>
    </header>
  );
}

export function Pillars() {
  return (
    <section id="ways" style={{ padding: "60px 32px 64px", ...dotGrid(false) }}>
      <div style={wrap}>
        <p style={{ textAlign: "center", fontFamily: font.mono, fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: color.textMutedLt, margin: "0 0 32px" }}>// one toolkit, two ways to build</p>
        <div className="pix-pillars" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {PILLARS.map((p) => (
            <NotchBox key={p.title} shadow={7} faceStyle={{ padding: 30 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
                <GlyphBadge glyph={p.glyph} tint={p.tint} size={52} />
                <div>
                  <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: ".12em", color: color.textMutedLt }}>{p.kicker}</div>
                  <div style={{ fontFamily: font.display, fontSize: 26, fontWeight: 600, color: color.ink }}>{p.title}</div>
                </div>
              </div>
              <p style={{ margin: "0 0 18px", fontSize: 15.5, lineHeight: 1.6, color: color.textBody }}>{p.body}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
                {p.points.map((pt) => <CheckRow key={pt} tint={p.tint}>{pt}</CheckRow>)}
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 9, background: color.ink, color: p.tint, fontFamily: font.mono, fontSize: 13, padding: "9px 14px" }}>
                <span style={{ color: color.textGhostDk }}>{p.cmdmark}</span>{p.cmd}
              </div>
            </NotchBox>
          ))}
        </div>
      </div>
    </section>
  );
}

export function NetworkStrip() {
  return (
    <section style={{ background: color.panelDeep, color: color.textLight, padding: "30px 32px", borderBottom: `3px solid ${color.ink}` }}>
      <div className="pix-quorum-strip" style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 430 }}>
          <h3 style={{ fontFamily: font.display, margin: "0 0 6px", fontSize: 22, fontWeight: 600, color: color.textLightHi }}>Built for how Qubic runs.</h3>
          <p style={{ margin: 0, fontSize: 14, color: color.textMutedDk, lineHeight: 1.5 }}>
            On mainnet, <span style={{ color: color.accent }}>676 computors</span> run every contract as native code, and a tick is final once a quorum of 451 agrees. qinit gives you that chain on your laptop, one tick at a time.
          </p>
        </div>
        <div style={{ flex: 1, minWidth: 300, maxWidth: 560 }}>
          <VoteDots count={40} cols={20} dur={2.4} />
        </div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section id="features" style={{ padding: "60px 32px 72px", ...wrap, ...dotGrid(false) }}>
      <h2 style={{ ...h2, textAlign: "center", marginBottom: 12 }}>Everything in the box.</h2>
      <p style={{ textAlign: "center", fontSize: 17, color: color.textBody, margin: "0 0 44px" }}>Batteries included, tuned for Qubic.</p>
      <div className="pix-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
        {FEATURES.map((f) => (
          <NotchBox key={f.title} shadow={6} faceStyle={{ padding: 26 }}>
            <GlyphBadge glyph={f.glyph} tint={f.tint} />
            <h3 style={{ fontFamily: font.display, margin: "18px 0 9px", fontSize: 22, fontWeight: 600, color: color.ink }}>{f.title}</h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: color.textBody }}>{f.body}</p>
          </NotchBox>
        ))}
      </div>
    </section>
  );
}

export function CodeShowcase() {
  return (
    <section className="pix-2col" style={{ padding: "8px 32px 80px", ...wrap, display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: 52, alignItems: "center" }}>
      <div>
        <Chip tone="yellow">Write less</Chip>
        <h2 style={{ ...h2, fontSize: 38, margin: "18px 0 16px", lineHeight: 1.1 }}>A contract is a file. Deploy is a command.</h2>
        <p style={{ margin: "0 0 24px", fontSize: 16.5, lineHeight: 1.65, color: color.textBody }}>
          No boilerplate. Define your contract, run <span style={{ fontFamily: font.mono, background: color.white, border: `2px solid ${color.ink}`, padding: "1px 6px" }}>qinit deploy</span>, and qinit compiles it, deploys it to your local node, and checks the code hash.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <CheckRow>One header, no project wiring.</CheckRow>
          <CheckRow>Running on a local node in seconds.</CheckRow>
          <CheckRow>State decoded by field name.</CheckRow>
        </div>
      </div>

      <NotchBox frame={color.ink} face={color.panel} shadow={7} lift={false} style={{ minWidth: 0 }} faceStyle={{ position: "relative", minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", borderBottom: `3px solid ${color.hair}`, background: color.panelDeep }}>
          <span style={{ width: 11, height: 11, background: color.accent }} />
          <span style={{ width: 11, height: 11, background: color.swatchOff }} />
          <span style={{ width: 11, height: 11, background: color.swatchOff }} />
          <span style={{ fontFamily: font.mono, fontSize: 12, marginLeft: 6, color: color.textFaintDk }}>Counter.h</span>
        </div>
        <Typewriter segs={TYPE_SEG} style={{ padding: 22, fontSize: 13.5, lineHeight: 1.85, height: 330, minWidth: 0, overflow: "hidden", whiteSpace: "pre" }} />
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "repeating-linear-gradient(transparent 0 2px, rgba(255,255,255,.025) 2px 3px)" }} />
      </NotchBox>
    </section>
  );
}

export function Path() {
  return (
    <section style={{ padding: "8px 32px 76px", ...wrap, ...dotGrid(false) }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <Chip tone="yellow">The path</Chip>
        <h2 style={{ ...h2, fontSize: 38, margin: "18px 0 8px" }}>From first line to mainnet.</h2>
        <p style={{ margin: 0, fontSize: 16, color: color.textBody }}>Every step has a command and a guide.</p>
      </div>
      <div className="pix-3col" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
        {PATH.map((p) => (
          <a key={p.title} href={p.href} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <NotchBox shadow={5} style={{ height: "100%" }} faceStyle={{ height: "100%", padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                <GlyphBadge glyph={p.step} tint={p.tint} size={36} />
                <span style={{ fontFamily: font.display, fontSize: 22, fontWeight: 600, color: color.ink }}>{p.title}</span>
              </div>
              <div style={{ display: "inline-block", background: color.ink, color: p.tint, fontFamily: font.mono, fontSize: 12, padding: "6px 10px", marginBottom: 12 }}>{p.cmd}</div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: color.textBody }}>{p.body}</p>
            </NotchBox>
          </a>
        ))}
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section style={{ padding: "0 32px", background: color.void }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ position: "relative", padding: "72px 40px", textAlign: "center", overflow: "hidden", ...dotGrid(true), backgroundImage: `radial-gradient(#19E0B412 1.5px, transparent 1.5px)` }}>
          <div style={{ position: "absolute", top: 34, left: "8%", width: 12, height: 12, background: color.accent, animation: "twk 3s ease-in-out infinite" }} />
          <div style={{ position: "absolute", bottom: 40, right: "10%", width: 16, height: 16, background: color.yellow, border: `3px solid ${color.void}`, animation: "twk 3.6s ease-in-out infinite" }} />
          <h2 style={{ fontFamily: font.display, margin: "0 0 14px", fontSize: 46, fontWeight: 700, color: color.textLightHi }}>Ship your first Qubic contract today.</h2>
          <p style={{ margin: "0 auto 32px", maxWidth: 460, fontSize: 17, color: color.textMutedDk }}>Free, open source, and ready the moment you install it.</p>
          <PixelButton href="/docs" onDark style={{ fontSize: 19 }}>Install qinit</PixelButton>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: `3px solid ${color.accent}`, padding: "30px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 18, background: color.void, color: color.textMutedDk }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <PixelQMark size={20} />
        <span style={{ fontFamily: font.display, fontSize: 18, fontWeight: 600, color: color.textLightHi }}>qinit</span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textGhostDk, marginLeft: 8 }}>independent · community framework · not affiliated with Qubic</span>
      </div>
      <div style={{ display: "flex", gap: 24, fontSize: 14, fontWeight: 500 }}>
        <a href="/docs" className="nav-link">Docs</a>
        <a href={REPO} className="nav-link">GitHub</a>
        <a href={`${REPO}/releases`} className="nav-link">Releases</a>
        <a href={IDE_URL} className="nav-link">IDE</a>
      </div>
    </footer>
  );
}
