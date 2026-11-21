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
        canvas: "#080A0F",
        surface: "#10141E",
        elevated: "#171D2B",
        hairline: "#1E2536",
        copper: {
          DEFAULT: "#EA7A3D",
          400: "#F2945E",
          500: "#EA7A3D",
          600: "#D16228",
        },
        ice: {
          DEFAULT: "#38BDF8",
          400: "#38BDF8",
          500: "#0EA5E9",
        },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "card-glow": "0 0 0 1px rgba(234, 122, 61, 0.28), 0 12px 32px -12px rgba(234, 122, 61, 0.18)",
        "ice-glow": "0 0 0 1px rgba(56, 189, 248, 0.28), 0 12px 32px -12px rgba(56, 189, 248, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
