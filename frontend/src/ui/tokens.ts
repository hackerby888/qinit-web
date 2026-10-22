// qinit IDE design tokens — one dark palette. Surfaces mirror Primer dark (canvas / border / fg roles); the chrome
// itself carries no brand colour: the "accent" is the text colour, so an active tab, a primary button or a selected
// row is told apart by weight and contrast, not hue. Colour means status only — ok, warn, and the red error literal.
export const color = {
  // surfaces
  void: "#0d1117", // canvas.default — page background
  panel: "#161b22", // canvas.subtle — cards / panels
  panelDeep: "#010409", // canvas.inset — title / status bars
  ink: "#30363d", // border.default — the universal border
  paper: "#e6edf3", // light surface (rare)
  white: "#f0f3f6",

  // signal — monochrome structure, one colour for actions
  accent: "#e6edf3", // active / current: active tab underline, selected edge, highlighted value
  accentDeep: "#30363d", // frames around dialogs and sections, the progress fill
  action: "#a78bfa", // something to press: primary buttons, hover edges — the site's violet, the CLI's accent
  ok: "#3fb950", // success — the only green, used for small marks and dots
  secondary: "#a5b4c4", // slate — procedures, state and logs read apart from functions by tone, not hue
  yellow: "#d29922", // attention / warn / prints

  // text
  textLight: "#c9d1d9", // body
  textLightHi: "#e6edf3", // headings (fg.default, brightest)
  textMutedDk: "#8b949e", // muted (fg.muted)
  textFaintDk: "#6e7681", // faint (fg.subtle)
  textGhostDk: "#545d68", // ghost (comments / prompts) — a touch above subtle for readability
  textBody: "#1f2328", // body on light
  textMutedLt: "#656d76",

  // lines
  hair: "#21262d", // border.muted — dividers inside windows
  hair2: "#30363d", // border.default — stronger hairline
  dotOff: "#21262d",
  swatchOff: "#30363d",
};

export const font = {
  display: "'Space Grotesk', sans-serif", // headings, wordmark, buttons (600)
  body: "'Space Grotesk', sans-serif", // paragraphs, list copy (400/500)
  mono: "'JetBrains Mono', monospace", // code, terminal, labels
};
