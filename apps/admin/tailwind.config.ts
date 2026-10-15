import type { Config } from "tailwindcss";

// Los colores viven como variables CSS (canales RGB) en src/styles/index.css
// para que el tema oscuro/claro cambie sin tocar ninguna clase. El formato
// `rgb(var(--x) / <alpha-value>)` mantiene los modificadores de opacidad
// de Tailwind (bg-accent/10, border-status-occupied/50).
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: token("bg"),
        surface: token("sf"),
        "surface-2": token("sf2"),
        "surface-3": token("sf3"),
        ink: token("ink"),
        "ink-muted": token("ink2"),
        "ink-faint": token("ink3"),
        line: token("line"),
        accent: token("acc"),
        "accent-ink": token("on-acc"),
        status: {
          available: token("s-free"),
          reserved: token("s-res"),
          arriving: token("s-arr"),
          occupied: token("s-occ"),
          paying: token("s-pay"),
          blocked: token("s-blk"),
          on: token("on-s"),
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
