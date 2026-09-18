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
        bg: "#f5f5f6",
        surface: "#ffffff",
        "surface-2": "#eeeef0",
        border: "#e6e6e8",
        text: "#141414",
        muted: "#6b6b70",
        faint: "#9a9aa0",
        accent: "#E8112D",
        "accent-soft": "rgba(232,17,45,0.10)",
        green: "#12965a",
        amber: "#b7791f",
        gray: "#6b6b70",
        // dark sidebar
        sidebar: "#141414",
        "sidebar-2": "#1e1e1f",
        "sidebar-text": "#b8b8bc",
        "sidebar-faint": "#7a7a80",
      },
      fontFamily: {
        sans: ["var(--font-barlow)", "system-ui", "sans-serif"],
        condensed: ["var(--font-barlow-condensed)", "var(--font-barlow)", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,20,20,0.05), 0 1px 3px rgba(20,20,20,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
