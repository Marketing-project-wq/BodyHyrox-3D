import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0d090b",
        surface: "#161016",
        "surface-2": "#1d151b",
        border: "#2b2028",
        text: "#f3e9ee",
        muted: "#9c8b95",
        faint: "#6f5e68",
        accent: "#ff2d55",
        "accent-soft": "rgba(255,45,85,0.12)",
        green: "#3ad29f",
        amber: "#f6b446",
        gray: "#8a7a82",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
      },
      fontVariantNumeric: {
        tabular: "tabular-nums",
      },
    },
  },
  plugins: [],
};

export default config;
