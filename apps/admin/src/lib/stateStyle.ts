import type { ReservationStatus, TableLiveStatusValue } from "@reservia/core";
import { themeColor, themeMix, type ThemeColorName } from "./theme";

/**
 * Única fuente de verdad de la gramática de estados: cada estado se distingue
 * por FORMA de relleno (punteado / anillo / halo / sólido / rayado / tramado),
 * no solo por color, para que se lea hasta en escala de grises. El plano, la
 * leyenda, la línea de tiempo y las pills salen de acá -- las clases `.st-*`
 * (styles/index.css) para HTML y `konvaLook` para el canvas.
 */
export type VisualState =
  | "free"
  | "reserved"
  | "arriving"
  | "occupied"
  | "paying"
  | "blocked"
  | "pending"
  | "completed"
  | "noshow";

const TABLE_TO_VISUAL: Record<TableLiveStatusValue, VisualState> = {
  available: "free",
  reserved: "reserved",
  arriving: "arriving",
  occupied: "occupied",
  paying: "paying",
  blocked: "blocked",
};

const RESERVATION_TO_VISUAL: Record<ReservationStatus, VisualState> = {
  pending: "pending",
  confirmed: "reserved",
  arriving: "arriving",
  seated: "occupied",
  completed: "completed",
  cancelled: "blocked",
  no_show: "noshow",
};

export function tableVisualState(status: TableLiveStatusValue): VisualState {
  return TABLE_TO_VISUAL[status];
}

export function reservationVisualState(status: ReservationStatus): VisualState {
  return RESERVATION_TO_VISUAL[status];
}

export const STATE_LABEL: Record<VisualState, string> = {
  free: "Disponible",
  reserved: "Reservada",
  arriving: "Por llegar",
  occupied: "Ocupada",
  paying: "Pagando",
  blocked: "Bloqueada",
  pending: "Pendiente",
  completed: "Completada",
  noshow: "No-show",
};

/** Clase CSS que aplica relleno + borde + texto del estado (el grosor lo pone quien la usa). */
export function stateClass(state: VisualState): string {
  return `st-${state}`;
}

const STATE_COLOR: Record<VisualState, ThemeColorName> = {
  free: "s-free",
  reserved: "s-res",
  arriving: "s-arr",
  occupied: "s-occ",
  paying: "s-pay",
  blocked: "s-blk",
  pending: "acc",
  completed: "s-free",
  noshow: "s-blk",
};

/** Color principal del estado como valor CSS que sigue al tema (para `style={{ color }}`). */
export function stateCssColor(state: VisualState): string {
  return `rgb(var(--${STATE_COLOR[state]}))`;
}

// ---------------------------------------------------------------- Konva

export interface KonvaLook {
  /** Relleno plano; undefined si el estado usa patrón o es transparente. */
  fill?: string;
  /** Patrón rayado/tramado (canvas offscreen de 10x10). */
  pattern?: HTMLCanvasElement;
  stroke: string;
  dash?: number[];
  /** Halo detrás de la mesa (solo "por llegar"). */
  halo?: string;
  /** Color del texto dentro de la mesa. */
  text: string;
}

function stripeTile(background: string | null, line: string, lineWidth: number, direction: "\\" | "/"): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = 10;
  tile.height = 10;
  const ctx = tile.getContext("2d")!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 10, 10);
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = lineWidth;
  // Tres pasadas para que el trazo diagonal enlace sin costura entre baldosas.
  for (const c of [-10, 0, 10]) {
    ctx.beginPath();
    if (direction === "\\") {
      ctx.moveTo(c, 0);
      ctx.lineTo(c + 10, 10);
    } else {
      ctx.moveTo(c + 10, 0);
      ctx.lineTo(c, 10);
    }
    ctx.stroke();
  }
  return tile;
}

/** Look de una mesa en Konva según el tema ACTUAL -- el llamador debe re-renderizar al cambiar de tema (useTheme). */
export function konvaLook(state: VisualState): KonvaLook {
  const stroke = themeColor(STATE_COLOR[state]);
  switch (state) {
    case "free":
      return { stroke, dash: [6, 4], text: themeColor("s-free") };
    case "reserved":
      return { fill: themeColor("sf"), stroke, text: themeColor("ink") };
    case "arriving":
      return { fill: themeColor("sf"), stroke, halo: themeColor("s-arr", 0.32), text: themeColor("ink") };
    case "occupied":
      return { fill: themeColor("s-occ"), stroke, text: themeColor("on-s") };
    case "paying": {
      // 55% del violeta sobre el fondo, igual que el color-mix de .st-paying.
      return {
        pattern: stripeTile(themeMix("s-pay", 55, "bg"), themeColor("s-pay"), 5, "\\"),
        stroke,
        text: themeColor("on-s"),
      };
    }
    case "blocked":
    case "noshow":
      return { pattern: stripeTile(null, themeColor("s-blk", 0.55), 2, "/"), stroke, text: themeColor("ink2") };
    case "pending":
      return { stroke, dash: [2, 4], text: themeColor("acc") };
    case "completed":
      return { fill: themeColor("s-free", 0.45), stroke: "transparent", text: themeColor("ink") };
  }
}

/** Puntos de la grilla del plano (1px cada 22px), como baldosa para fillPatternImage. */
export function dotGridTile(): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.width = 22;
  tile.height = 22;
  const ctx = tile.getContext("2d")!;
  ctx.fillStyle = themeColor("ink3", 0.45);
  ctx.beginPath();
  ctx.arc(11, 11, 1, 0, Math.PI * 2);
  ctx.fill();
  return tile;
}
