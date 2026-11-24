import type { Table } from "@reservia/core";

/** Una silla vista desde arriba, en coordenadas locales de la mesa (origen en su centro). */
export interface ChairSlot {
  x: number;
  y: number;
  /** 0 = la silla está arriba de la mesa mirándola; 90 = a la derecha; 180 = abajo; 270 = a la izquierda. */
  rotation: number;
  width: number;
  depth: number;
}

const MAX_CHAIRS = 12;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Tamaño de las sillas en proporción a la mesa, para que se vean bien tanto en mesas chicas (barra) como grandes. */
export function chairMetrics(table: Pick<Table, "width" | "height">) {
  const base = Math.min(table.width, table.height);
  return {
    depth: clamp(base * 0.34, 8, 20),
    width: clamp(base * 0.46, 11, 28),
    gap: clamp(base * 0.05, 2, 4),
  };
}

/** Cuánto sobresalen las sillas del borde de la mesa (para ubicar textos y halos). */
export function chairReach(table: Pick<Table, "width" | "height">): number {
  const m = chairMetrics(table);
  return m.depth + m.gap;
}

function side(count: number, length: number, offset: number, rotation: number, horizontal: boolean, m: ReturnType<typeof chairMetrics>): ChairSlot[] {
  if (count <= 0) return [];
  const step = length / count;
  const width = Math.min(m.width, step - 2);
  return Array.from({ length: count }, (_, i) => {
    const along = -length / 2 + step * (i + 0.5);
    return {
      x: horizontal ? along : offset,
      y: horizontal ? offset : along,
      rotation,
      width,
      depth: m.depth,
    };
  });
}

/**
 * Dónde van las sillas de una mesa. Una por cada asiento de su capacidad máxima:
 * redonda = en círculo; cuadrada = repartidas en los 4 lados; rectangular = a lo largo de los lados
 * largos (y una en cada punta cuando es una mesa larga con varios asientos).
 */
export function chairSlots(table: Pick<Table, "shape" | "width" | "height" | "capacityMax">): ChairSlot[] {
  const n = clamp(Math.round(table.capacityMax), 1, MAX_CHAIRS);
  const m = chairMetrics(table);
  const w = table.width;
  const h = table.height;

  if (table.shape === "round") {
    const r = Math.min(w, h) / 2;
    const ring = r + m.gap + m.depth / 2;
    const width = Math.min(m.width, ((2 * Math.PI * ring) / n) * 0.82);
    return Array.from({ length: n }, (_, i) => {
      const phi = (i * 360) / n;
      const rad = (phi * Math.PI) / 180;
      return { x: Math.sin(rad) * ring, y: -Math.cos(rad) * ring, rotation: phi, width, depth: m.depth };
    });
  }

  const outY = h / 2 + m.gap + m.depth / 2;
  const outX = w / 2 + m.gap + m.depth / 2;
  const ratio = Math.max(w, h) / Math.min(w, h);
  const longHorizontal = w >= h;

  // Mesa larga con varios asientos: una silla en cada punta y el resto en los lados largos.
  if (ratio >= 1.35 && n >= 6) {
    const rest = n - 2;
    const first = Math.ceil(rest / 2);
    const second = Math.floor(rest / 2);
    return longHorizontal
      ? [
          ...side(first, w, -outY, 0, true, m),
          ...side(second, w, outY, 180, true, m),
          ...side(1, h, -outX, 270, false, m),
          ...side(1, h, outX, 90, false, m),
        ]
      : [
          ...side(first, h, -outX, 270, false, m),
          ...side(second, h, outX, 90, false, m),
          ...side(1, w, -outY, 0, true, m),
          ...side(1, w, outY, 180, true, m),
        ];
  }

  // Cuadrada (o rectangular con pocos asientos): se reparte entre los lados, empezando por los dos largos.
  const order = longHorizontal ? ["top", "bottom", "left", "right"] : ["left", "right", "top", "bottom"];
  const counts: Record<string, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  for (let i = 0; i < n; i++) counts[order[i % 4]!]! += 1;

  return [
    ...side(counts.top!, w, -outY, 0, true, m),
    ...side(counts.bottom!, w, outY, 180, true, m),
    ...side(counts.left!, h, -outX, 270, false, m),
    ...side(counts.right!, h, outX, 90, false, m),
  ];
}
