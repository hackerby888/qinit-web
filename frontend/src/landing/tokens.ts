// qinit design tokens — single source of truth (from the official design handoff).
// Style = "pixel / neo-brutalist": flat fills, 3px ink borders, HARD offset
// shadows (no blur), notched/bitten corners, zero border-radius (except the q-seed).
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
  accent: "#19E0B4", // mint — primary brand / signal
  accentMid: "#12B891", // mint shade (voxel left face)
  accentDeep: "#0B7A63", // mint deep (voxel right face, button frames, shadows on dark)
  accentShadow: "#073A30", // hard-shadow color for accent buttons on dark
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

// The IDE-only "flat" theme: near-black surfaces, near-monochrome, one dim teal-grey accent. No notches
// or hard shadows (the structure lives in the chrome, gated on themeFlags.flat). Same 25 keys as NEO.
const FLAT: typeof NEO = {
  void: "#0A0A0B",
  panel: "#121214",
  panelDeep: "#0E0E10",
  ink: "#26262B",
  paper: "#E8E8EA",
  white: "#F4F4F5",

  accent: "#7FA6AD",
  accentMid: "#5E8086",
  accentDeep: "#466065",
  accentShadow: "#2B3A3D",
  secondary: "#8A8F98",
  secondaryDeep: "#5A5E66",
  secondaryDk: "#44474E",
  yellow: "#AEA686",

  textLight: "#B8BABF",
  textLightHi: "#D2D4D8",
  textMutedDk: "#8A8D93",
  textFaintDk: "#6C6F75",
  textGhostDk: "#54575C",
  textBody: "#2A2B2E",
  textMutedLt: "#6A6B6E",

  hair: "#222226",
  hair2: "#2A2A2F",
  dotOff: "#222226",
  swatchOff: "#2E2E33",
};

// The live, mutable active palette. Every chrome read goes through this object; applyTheme() swaps its
// values in place so existing inline `color.*` reads pick up the change on the next render. Initialised to
// NEO so module-level captures (landing / gallery) bake the neo-brutalist look at import.
export const color = { ...NEO };

export type ThemeName = "neo" | "flat";

// Live structural flag for the chrome — read at render time, never destructured into a local. Tells the
// notch/shadow code paths to collapse to flat 1px borders.
export const themeFlags = { flat: false };

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
