import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#141210",
        surface: "#1c1916",
        "surface-2": "#26221d",
        ink: "#f3eee4",
        "ink-muted": "#b7ac9a",
        "ink-faint": "#8a7f6d",
        line: "#39332b",
        accent: "#de9a4c",
        "accent-ink": "#1c1512",
        status: {
          occupied: "#dd7c68",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
