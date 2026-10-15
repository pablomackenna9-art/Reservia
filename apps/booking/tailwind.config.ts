import type { Config } from "tailwindcss";

// Página pública: "papel de carta", siempre en tema claro (el comensal no elige tema).
// Mismos nombres de token que el panel para que las clases sigan siendo las mismas.
export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#f6f0e6",
        surface: "#ebe4d7",
        "surface-2": "#fffdf8",
        ink: "#1d1813",
        "ink-muted": "#54493c",
        "ink-faint": "#776b5a",
        line: "#e3d9c8",
        "line-strong": "#d2c6b2",
        accent: "#a85d17",
        "accent-ink": "#ffffff",
        "ink-dark": "#1d1813",
        "on-dark": "#f5efe4",
        "on-dark-faint": "#948875",
        "free-on-dark": "#52b788",
        "day-off": "#b9ad9a",
        status: {
          available: "#1f7a52",
          arriving: "#9a6f0c",
          occupied: "#bd4a33",
        },
      },
      fontFamily: {
        sans: ['"Instrument Sans"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ['"Instrument Serif"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
