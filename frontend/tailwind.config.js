/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // theme-flipping tokens (driven by CSS vars in index.css)
        paper: v("paper"), // canvas
        card: v("card"), // raised surfaces
        snow: v("snow"), // hairlines / hover wash
        ink: v("ink"), // primary text + hairline source
        slate: v("slate"), // secondary text
        faint: v("faint"), // tertiary / captions
        "green-deep": v("accent"), // accent on the page (links, signals)
        // constant tokens (same in both themes)
        ink2: "#0F1411", // dark "screen" surface (terminal / code)
        graphite: "#161C18", // dark screen alt
        bone: "#E8EAE6", // primary text on dark screens
        mist: "#8A938C", // secondary text on dark screens
        green: "#3FB950", // phosphor on dark screens / lattice
        amber: "#FFB347", // confirm signal — rationed
      },
      fontFamily: {
        display: ["Space Grotesk", "Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Geist", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 16px 44px -24px rgba(11,14,12,.28)", // soft lift on light
        card: "0 1px 2px rgba(11,14,12,.04), 0 12px 32px -20px rgba(11,14,12,.18)",
        screen: "0 30px 70px -34px rgba(11,14,12,.55)", // dark terminal lift
      },
      keyframes: {
        fadeup: { "0%": { opacity: 0, transform: "translateY(16px)" }, "100%": { opacity: 1, transform: "none" } },
        blink: { "0%,100%": { opacity: 1 }, "50%": { opacity: 0 } },
        "tick-pulse": {
          "0%,100%": { opacity: 0.55, transform: "scale(1)" },
          "50%": { opacity: 1, transform: "scale(1.25)" },
        },
        sweep: { "0%": { backgroundPosition: "-120% 0" }, "100%": { backgroundPosition: "220% 0" } },
      },
      animation: {
        fadeup: "fadeup .7s cubic-bezier(.2,.7,.2,1) both",
        blink: "blink 1.05s step-end infinite",
        "tick-pulse": "tick-pulse 3.4s ease-in-out infinite",
        sweep: "sweep 7s linear infinite",
      },
    },
  },
  plugins: [],
};
