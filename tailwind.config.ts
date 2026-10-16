import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        panel: "var(--panel)",
        panelMuted: "var(--panel-muted)",
        border: "var(--border)",
        text: "var(--text)",
        textMuted: "var(--text-muted)",
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(255,255,255,0.08), 0 20px 40px rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;

