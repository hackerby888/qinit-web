// qinit design tokens — single source of truth (from the official design handoff).
// Style = "pixel / neo-brutalist": flat fills, 3px ink borders, HARD offset
// shadows (no blur), notched/bitten corners, zero border-radius (except the q-seed).
export const color = {
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
