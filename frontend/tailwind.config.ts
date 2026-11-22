import type { Config } from "tailwindcss";

/**
 * A restrained instrument palette. The brightest colours in the system are
 * reserved for data; chrome stays quiet so the numbers carry the contrast.
 *
 * The look takes its cues from a trackside timing wall — near-black chrome,
 * team-colour accents, and a small set of signal colours with fixed meanings
 * (purple = session best, green = personal best, amber = caution/held, red =
 * danger/stopped). Motion in the UI exists only to show *change over time*:
 * rows settling into a new order, a value flashing the instant it updates.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#06070a",
          900: "#0a0c10",
          850: "#0f1216",
          800: "#151920",
          700: "#1d232b",
          600: "#2a323b",
          500: "#3a444f",
        },
        ink: {
          DEFAULT: "#eef2f7",
          muted: "#8d97a3",
          faint: "#5d6670",
        },
        signal: {
          ok: "#2ee6a8",
          warn: "#ffb020",
          alert: "#ff4d5e",
          info: "#4da6ff",
          purple: "#c77dff",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        radioBar: {
          "0%, 100%": { transform: "scaleY(0.5)" },
          "50%": { transform: "scaleY(1.4)" },
        },
        messageIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        /* Functional: a cell flashes the instant its value changes, so the eye
         * is drawn to what just updated. Colour is set per-use via --flash. */
        flash: {
          "0%": { backgroundColor: "color-mix(in srgb, var(--flash) 38%, transparent)" },
          "100%": { backgroundColor: "transparent" },
        },
        /* A new fastest-in-session lap: a brief purple sweep across the row. */
        bestSweep: {
          "0%": { backgroundColor: "color-mix(in srgb, #c77dff 26%, transparent)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite",
        "radio-bar": "radioBar 0.9s ease-in-out infinite",
        "message-in": "messageIn 0.2s ease-out",
        flash: "flash 0.75s ease-out",
        "best-sweep": "bestSweep 1.1s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
