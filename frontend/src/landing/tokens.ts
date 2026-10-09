// qinit design tokens — single source of truth (from the official design handoff).
// Style = "pixel / neo-brutalist": flat fills, 3px ink borders, HARD offset
// shadows (no blur), notched/bitten corners, zero border-radius (except the q-seed).
// the brand green, shared by both palettes: one accent whether the chrome is neo or flat.
const GREEN = {
  accent: "#3FB950", // primary brand / signal
  accentMid: "#2EA043", // shade (voxel left face)
  accentDeep: "#238636", // deep (voxel right face, button frames, shadows on dark)
  accentShadow: "#16401F", // hard-shadow color for accent buttons on dark
};

// The original "neo-brutalist" palette — the single source of truth for the landing, the projects
// gallery and the IDE chrome's default look.
const NEO = {
  // surfaces
  void: "#070908", // darkest bg (nav, hero, dark sections, footer)
  panel: "#0F1210", // dark cards / window bodies
  panelDeep: "#0B0E0C", // window title/status bars
  ink: "#16190F", // primary text on light + the universal border color
  paper: "#F2EFE3", // light page background (warm)
  white: "#FFFFFF", // light card faces

  // brand
  ...GREEN,
  secondary: "#9B8CFF", // grape — secondary accent
  secondaryDeep: "#5A4ACB",
  secondaryDk: "#3A2EA0", // voxel right face for grape
  yellow: "#FFD23F", // highlight chip / tertiary

  // text scale
  textLight: "#EAF0ED", // body on dark
  textLightHi: "#F4F8F5", // headings on dark
  textMutedDk: "#9AA39C", // muted on dark
  textFaintDk: "#7E887F", // faint on dark (labels)
  textGhostDk: "#5E6760", // ghost on dark (comments, prompts)
  textBody: "#3C402F", // body on light
  textMutedLt: "#8A8E78", // muted on light

  // lines on dark
  hair: "#1C2622", // borders/dividers inside dark windows
  hair2: "#232925", // hairline (capability chips, nav divider)
  dotOff: "#1C2622", // un-voted quorum dot
  swatchOff: "#2A312C", // inactive window traffic-light
};

// The IDE-only "flat" theme: GitHub-dark. Blue-black canvas with layered surfaces, visible gray borders,
// high-contrast text, a green signal accent (Qinit identity, doubling as GitHub's primary-button green) and
// GitHub blue as the secondary. No notches or hard shadows (structure lives in the chrome, gated on
// themeFlags.flat). Same 25 keys as NEO. Values mirror Primer dark (canvas/border/fg/accent roles).
const FLAT: typeof NEO = {
  void: "#0d1117",      // canvas.default — primary dark bg
  panel: "#161b22",     // canvas.subtle — cards / panels
  panelDeep: "#010409",  // canvas.inset — title/status bars (deepest)
  ink: "#30363d",       // border.default — universal border
  paper: "#e6edf3",     // light surface (rare in the dark IDE)
  white: "#f0f3f6",

  ...GREEN,               // success.fg / success.emphasis — the same green as neo
  secondary: "#2f81f7",   // accent.fg — links / secondary
  secondaryDeep: "#1f6feb",
  secondaryDk: "#194fb3",
  yellow: "#d29922",      // attention.fg

  textLight: "#c9d1d9",   // body on dark
  textLightHi: "#e6edf3", // headings (fg.default, brightest)
  textMutedDk: "#8b949e", // muted (fg.muted)
  textFaintDk: "#6e7681", // faint (fg.subtle)
  textGhostDk: "#545d68", // ghost (comments/prompts) — a touch above subtle for readability
  textBody: "#1f2328",    // body on light
  textMutedLt: "#656d76",

  hair: "#21262d",   // border.muted — dividers inside windows
  hair2: "#30363d",  // border.default — stronger hairline
  dotOff: "#21262d",
  swatchOff: "#30363d",
};

// The live, mutable active palette. Every chrome read goes through this object; applyTheme() swaps its
// values in place so existing inline `color.*` reads pick up the change on the next render. Initialised
// from the <html> data-ide-theme attribute (set inline in index.html before the JS bundle loads) so the
// IDE starts in the right palette without a flash; defaults to NEO (landing / gallery / non-IDE routes).
function readInitialTheme(): ThemeName {
  if (typeof window !== "undefined" && (window as any).__QINIT_IDE_THEME__ === "flat") return "flat";
  return "neo";
}

export const color = readInitialTheme() === "flat" ? { ...FLAT } : { ...NEO };

export type ThemeName = "neo" | "flat";

// Live structural flag for the chrome — read at render time, never destructured into a local. Tells the
// notch/shadow code paths to collapse to flat 1px borders.
export const themeFlags = { flat: readInitialTheme() === "flat" };

// Swap the active palette in place (mutates `color` so live inline reads update) and flip the flat flag.
export function applyTheme(name: ThemeName): void {
  Object.assign(color, name === "flat" ? FLAT : NEO);
  themeFlags.flat = name === "flat";
}

export const font = {
  display: "'Pixelify Sans', sans-serif", // headings, wordmark, buttons (600/700)
  body: "'Space Grotesk', sans-serif", // paragraphs, nav, list copy (400/500)
  mono: "'JetBrains Mono', monospace", // code, terminal, labels, kickers
};

// The signature "bitten corner" shape. Same 8px notch on all four corners.
export const NOTCH =
  "polygon(8px 0, calc(100% - 8px) 0, calc(100% - 8px) 8px, 100% 8px, " +
  "100% calc(100% - 8px), calc(100% - 8px) calc(100% - 8px), " +
  "calc(100% - 8px) 100%, 8px 100%, 8px calc(100% - 8px), " +
  "0 calc(100% - 8px), 0 8px, 8px 8px)";

// Hard offset shadow helper (no blur). On clip-path elements use filter: drop-shadow().
export const hardShadow = (x = 6, y = 6, c = color.ink): string => `drop-shadow(${x}px ${y}px 0 ${c})`;

export const space = { section: 64, gutter: 32, maxW: 1140, card: 26, gap: 24 };
