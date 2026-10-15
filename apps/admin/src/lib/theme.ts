import { useSyncExternalStore } from "react";

export type Theme = "oscuro" | "claro";

const STORAGE_KEY = "reservia-theme";
const EVENT = "reservia-theme-change";

export function getTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "claro" ? "claro" : "oscuro";
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // sin localStorage (modo privado): el tema sigue aplicado en esta sesión
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleTheme() {
  setTheme(getTheme() === "oscuro" ? "claro" : "oscuro");
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

/** Re-renderiza al cambiar de tema -- necesario para Konva, que no lee variables CSS por sí solo. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => "oscuro" as Theme);
}

export type ThemeColorName =
  | "bg"
  | "sf"
  | "sf2"
  | "sf3"
  | "line"
  | "ink"
  | "ink2"
  | "ink3"
  | "acc"
  | "on-acc"
  | "s-free"
  | "s-res"
  | "s-arr"
  | "s-occ"
  | "s-pay"
  | "s-blk"
  | "on-s";

function channels(name: ThemeColorName): [number, number, number] {
  const [r, g, b] = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).map(Number);
  return [r ?? 0, g ?? 0, b ?? 0];
}

/** Color del tema actual como `rgb(r, g, b)` (o `rgba` con alpha) -- para Konva y otros consumidores que no entienden `var()`. */
export function themeColor(name: ThemeColorName, alpha = 1): string {
  const [r, g, b] = channels(name);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mezcla `pct`% de `a` con el resto de `b` (equivalente al color-mix de las clases CSS, sin depender del navegador). */
export function themeMix(a: ThemeColorName, pct: number, b: ThemeColorName): string {
  const ca = channels(a);
  const cb = channels(b);
  const mix = ca.map((v, i) => Math.round((v * pct) / 100 + cb[i]! * (1 - pct / 100)));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}
