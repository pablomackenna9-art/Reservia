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

type Metrics = ReturnType<typeof chairMetrics>;

function side(count: number, length: number, offset: number, rotation: number, horizontal: boolean, m: Metrics): ChairSlot[] {
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

/** A qué lado de la mesa pertenece una silla según hacia dónde mira (0 arriba, 1 derecha, 2 abajo, 3 izquierda). */
function sideOfRotation(rotation: number): number {
  return ((Math.round(rotation / 90) % 4) + 4) % 4;
}

/**
 * Dónde van las sillas de una mesa. Una por cada asiento de su capacidad máxima:
 * redonda = en círculo; cuadrada = repartidas en los 4 lados; rectangular = a lo largo de los lados
 * largos (y una en cada punta cuando es una mesa larga con varios asientos).
 *
 * - `drop`: lados pegados a un sofá/banqueta (0 arriba, 1 derecha, 2 abajo, 3 izquierda, en el marco de la
 *   mesa). Ahí la gente se sienta en el sofá: esas sillas no se dibujan.
 * - `closed`: lados pegados a otro módulo de la misma mesa larga. Ahí no caben sillas, así que esos asientos se
 *   reparten en los lados que quedan libres (la capacidad no cambia).
 */
export function chairSlots(
  table: Pick<Table, "shape" | "width" | "height" | "capacityMax">,
  drop?: ReadonlySet<number>,
  closed?: ReadonlySet<number>,
): ChairSlot[] {
  const n = clamp(Math.round(table.capacityMax), 1, MAX_CHAIRS);
  const m = chairMetrics(table);
  const w = table.width;
  const h = table.height;
  const hasDrop = !!drop && drop.size > 0;
  const hasClosed = !!closed && closed.size > 0;

  if (table.shape === "round") {
    const r = Math.min(w, h) / 2;
    const ring = r + m.gap + m.depth / 2;
    const width = Math.min(m.width, ((2 * Math.PI * ring) / n) * 0.82);
    const all = Array.from({ length: n }, (_, i): ChairSlot => {
      const phi = (i * 360) / n;
      const rad = (phi * Math.PI) / 180;
      return { x: Math.sin(rad) * ring, y: -Math.cos(rad) * ring, rotation: phi, width, depth: m.depth };
    });
    if (!hasDrop && !hasClosed) return all;
    return all.filter((s) => {
      const sd = sideOfRotation(s.rotation);
      return !drop?.has(sd) && !closed?.has(sd);
    });
  }

  const outY = h / 2 + m.gap + m.depth / 2;
  const outX = w / 2 + m.gap + m.depth / 2;
  const ratio = Math.max(w, h) / Math.min(w, h);
  const longHorizontal = w >= h;

  // Cuántas sillas van en cada lado: [arriba, derecha, abajo, izquierda].
  const counts = [0, 0, 0, 0];
  if (ratio >= 1.35 && n >= 6) {
    // Mesa larga con varios asientos: una silla en cada punta y el resto en los lados largos.
    const rest = n - 2;
    const first = Math.ceil(rest / 2);
    const second = Math.floor(rest / 2);
    if (longHorizontal) {
      counts[0] = first;
      counts[2] = second;
      counts[1] = 1;
      counts[3] = 1;
    } else {
      counts[3] = first;
      counts[1] = second;
      counts[0] = 1;
      counts[2] = 1;
    }
  } else {
    // Cuadrada (o rectangular con pocos asientos): se reparte entre los lados, empezando por los dos largos.
    const order = longHorizontal ? [0, 2, 3, 1] : [3, 1, 0, 2];
    for (let i = 0; i < n; i++) counts[order[i % 4]!]! += 1;
  }

  // Lados con sofá: esas sillas no existen (se sientan en el sofá).
  if (hasDrop) for (const sd of drop!) counts[sd] = 0;

  // Lados pegados a otro módulo: sus asientos pasan a los lados libres (los largos primero).
  if (hasClosed) {
    const free = (longHorizontal ? [0, 2, 1, 3] : [3, 1, 0, 2]).filter((sd) => !closed!.has(sd) && !drop?.has(sd));
    let moving = 0;
    for (const sd of closed!) {
      moving += counts[sd]!;
      counts[sd] = 0;
    }
    for (let i = 0; i < moving && free.length > 0; i++) counts[free[i % free.length]!]! += 1;
  }

  return [
    ...side(counts[0]!, w, -outY, 0, true, m),
    ...side(counts[2]!, w, outY, 180, true, m),
    ...side(counts[3]!, h, -outX, 270, false, m),
    ...side(counts[1]!, h, outX, 90, false, m),
  ];
}

/**
 * Lados de la mesa que tocan alguno de los objetos dados (un sofá, o el módulo vecino de la misma mesa larga).
 * Un lado cuenta como pegado si el punto justo afuera de su centro cae sobre el objeto (con un pequeño margen),
 * sin importar cómo estén girados la mesa o el objeto.
 */
export function coveredSides(
  table: Pick<Table, "positionX" | "positionY" | "width" | "height" | "rotation">,
  zone: Pick<Zone, "width" | "height">,
  neighbors: ReadonlyArray<Pick<ZoneDecor, "positionX" | "positionY" | "width" | "height" | "rotation">>,
): Set<number> {
  const covered = new Set<number>();
  if (neighbors.length === 0) return covered;

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

  for (let sd = 0; sd < 4; sd++) {
    const dist = half[sd]! + reach + 4;
    const lx = normals[sd]![0] * dist;
    const ly = normals[sd]![1] * dist;
    const px = cx + lx * Math.cos(tr) - ly * Math.sin(tr);
    const py = cy + lx * Math.sin(tr) + ly * Math.cos(tr);

    for (const o of neighbors) {
      const ox = (o.positionX / 100) * zone.width;
      const oy = (o.positionY / 100) * zone.height;
      const or = (-o.rotation * Math.PI) / 180;
      const dx = px - ox;
      const dy = py - oy;
      const ux = dx * Math.cos(or) - dy * Math.sin(or);
      const uy = dx * Math.sin(or) + dy * Math.cos(or);
      if (Math.abs(ux) <= o.width / 2 + 6 && Math.abs(uy) <= o.height / 2 + 6) {
        covered.add(sd);
        break;
      }
    }
  }
  return covered;
}
