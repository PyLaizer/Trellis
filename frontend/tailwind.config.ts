import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#070B12",
        surface: "#0E1525",
        elevated: "#162036",
        hairline: "#1F2D4A",
        emerald: {
          DEFAULT: "#10B981",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
        },
        cyan: {
          DEFAULT: "#22D3EE",
          400: "#22D3EE",
          500: "#06B6D4",
        },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "card-glow": "0 0 0 1px rgba(16, 185, 129, 0.25), 0 12px 32px -12px rgba(16, 185, 129, 0.18)",
        "cyan-glow": "0 0 0 1px rgba(34, 211, 238, 0.28), 0 12px 32px -12px rgba(34, 211, 238, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
