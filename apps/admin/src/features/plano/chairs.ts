import type { Table, Zone, ZoneDecor } from "@reservia/core";

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
export function chairSlots(
  table: Pick<Table, "shape" | "width" | "height" | "capacityMax">,
  /** Lados donde NO van sillas porque ahí hay un sofá/banqueta (0 arriba, 1 derecha, 2 abajo, 3 izquierda, en el marco de la mesa). */
  skipSides?: ReadonlySet<number>,
): ChairSlot[] {
  const all = allChairSlots(table);
  if (!skipSides || skipSides.size === 0) return all;
  return all.filter((slot) => !skipSides.has(sideOfRotation(slot.rotation)));
}

/** A qué lado de la mesa pertenece una silla según hacia dónde mira (0 arriba, 1 derecha, 2 abajo, 3 izquierda). */
function sideOfRotation(rotation: number): number {
  return (((Math.round(rotation / 90) % 4) + 4) % 4) as number;
}

/**
 * Lados de la mesa que están pegados a un sofá (banqueta larga): ahí la gente se sienta en el sofá,
 * así que no se dibujan sillas. Un lado cuenta como pegado si el punto justo afuera de su centro cae
 * sobre el sofá (con un pequeño margen), sin importar cómo estén girados la mesa o el sofá.
 */
export function coveredSides(
  table: Pick<Table, "positionX" | "positionY" | "width" | "height" | "rotation">,
  zone: Pick<Zone, "width" | "height">,
  sofas: ReadonlyArray<Pick<ZoneDecor, "positionX" | "positionY" | "width" | "height" | "rotation">>,
): Set<number> {
  const covered = new Set<number>();
  if (sofas.length === 0) return covered;

  const cx = (table.positionX / 100) * zone.width;
  const cy = (table.positionY / 100) * zone.height;
  const reach = chairReach(table);
  const tr = (table.rotation * Math.PI) / 180;
  const half = [table.height / 2, table.width / 2, table.height / 2, table.width / 2];
  const normals: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  for (let side = 0; side < 4; side++) {
    const dist = half[side]! + reach + 4;
    const lx = normals[side]![0] * dist;
    const ly = normals[side]![1] * dist;
    const px = cx + lx * Math.cos(tr) - ly * Math.sin(tr);
    const py = cy + lx * Math.sin(tr) + ly * Math.cos(tr);

    for (const sofa of sofas) {
      const sx = (sofa.positionX / 100) * zone.width;
      const sy = (sofa.positionY / 100) * zone.height;
      const sr = (-sofa.rotation * Math.PI) / 180;
      const dx = px - sx;
      const dy = py - sy;
      const ux = dx * Math.cos(sr) - dy * Math.sin(sr);
      const uy = dx * Math.sin(sr) + dy * Math.cos(sr);
      if (Math.abs(ux) <= sofa.width / 2 + 6 && Math.abs(uy) <= sofa.height / 2 + 6) {
        covered.add(side);
        break;
      }
    }
  }
  return covered;
}

function allChairSlots(table: Pick<Table, "shape" | "width" | "height" | "capacityMax">): ChairSlot[] {
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
