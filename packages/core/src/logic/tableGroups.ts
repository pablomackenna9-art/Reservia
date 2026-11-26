import { compareTableNames } from "./tableOrder";
import { tableBaseName, type Table, type Zone } from "../types/floorplan";

/**
 * Mesas que funcionan como UNA sola. Un módulo (5-A, 5-B...) que está pegado a otra mesa pasa a ser parte de ella:
 * lleva su número y suma sus asientos. Se calcula con la posición de las mesas en el plano (no se guarda aparte),
 * así que moverlas en el plano es lo único que hace falta para unirlas o separarlas.
 */
export interface TableGroup {
  id: string;
  zoneId: string;
  /** Número que se muestra: el de la mesa "dueña" del grupo. */
  label: string;
  /** Asientos de todo el grupo. */
  capacity: number;
  members: Table[];
  /** Si los miembros forman una hilera recta, la mesa única equivalente (en unidades de la zona). null = no. */
  merged: MergedGeometry | null;
}

export interface MergedGeometry {
  x: number;
  y: number;
  /** Giro del conjunto (0 = ancho horizontal). `width` y `height` ya vienen en ese marco. */
  rotation: number;
  width: number;
  height: number;
}

type ZoneSize = Pick<Zone, "id" | "width" | "height">;

const TOUCH_GAP = 6; // hasta cuánto pueden separarse dos mesas para considerarse pegadas
const PARALLEL = 1.5; // tolerancia de giro (grados)
const SNAP = 16; // distancia del imán al soltar una mesa junto a otra

interface Frame {
  /** Giro "fino" respecto a los ejes: una mesa a 90° o 270° se trata como derecha con ancho y alto cambiados. */
  phi: number;
  w: number;
  h: number;
}

function frameOf(t: Pick<Table, "rotation" | "width" | "height">): Frame {
  const k = Math.round(t.rotation / 90);
  const phi = t.rotation - 90 * k;
  const swapped = Math.abs(k) % 2 === 1;
  return { phi, w: swapped ? t.height : t.width, h: swapped ? t.width : t.height };
}

function toZone(table: Pick<Table, "positionX" | "positionY">, zone: ZoneSize) {
  return { x: (table.positionX / 100) * zone.width, y: (table.positionY / 100) * zone.height };
}

function rot(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
}

function compatible(a: Frame, b: Frame): boolean {
  return Math.abs(a.phi - b.phi) < PARALLEL;
}

/** ¿Están pegadas? (al menos una es módulo, las dos rectangulares y alineadas, tocándose por un lado) */
function attached(a: Table, b: Table, zone: ZoneSize): boolean {
  if (!a.layoutId && !b.layoutId) return false;
  if (a.shape === "round" || b.shape === "round") return false;
  const fa = frameOf(a);
  const fb = frameOf(b);
  if (!compatible(fa, fb)) return false;
  const pa = toZone(a, zone);
  const pb = toZone(b, zone);
  const d = rot(pb.x - pa.x, pb.y - pa.y, -fa.phi);
  const gapX = Math.abs(d.x) - (fa.w + fb.w) / 2;
  const gapY = Math.abs(d.y) - (fa.h + fb.h) / 2;
  const overlapY = Math.min(fa.h / 2, d.y + fb.h / 2) - Math.max(-fa.h / 2, d.y - fb.h / 2);
  const overlapX = Math.min(fa.w / 2, d.x + fb.w / 2) - Math.max(-fa.w / 2, d.x - fb.w / 2);
  if (Math.abs(gapX) <= TOUCH_GAP && overlapY >= 0.5 * Math.min(fa.h, fb.h)) return true;
  if (Math.abs(gapY) <= TOUCH_GAP && overlapX >= 0.5 * Math.min(fa.w, fb.w)) return true;
  return false;
}

function mergedGeometry(members: Table[], zone: ZoneSize): MergedGeometry | null {
  const first = members[0]!;
  if (members.some((m) => m.shape === "round")) return null;
  const f0 = frameOf(first);
  const frames = members.map(frameOf);
  if (frames.some((f) => !compatible(f, f0))) return null;
  const p0 = toZone(first, zone);
  const local = members.map((m, i) => {
    const p = toZone(m, zone);
    return { ...rot(p.x - p0.x, p.y - p0.y, -f0.phi), w: frames[i]!.w, h: frames[i]!.h };
  });
  const row = local.every((l) => Math.abs(l.y - local[0]!.y) <= 6 && Math.abs(l.h - local[0]!.h) <= 8);
  const column = local.every((l) => Math.abs(l.x - local[0]!.x) <= 6 && Math.abs(l.w - local[0]!.w) <= 8);
  if (!row && !column) return null;

  let cx: number;
  let cy: number;
  let width: number;
  let height: number;
  if (row) {
    const min = Math.min(...local.map((l) => l.x - l.w / 2));
    const max = Math.max(...local.map((l) => l.x + l.w / 2));
    cx = (min + max) / 2;
    cy = local.reduce((s, l) => s + l.y, 0) / local.length;
    width = max - min;
    height = Math.max(...local.map((l) => l.h));
  } else {
    const min = Math.min(...local.map((l) => l.y - l.h / 2));
    const max = Math.max(...local.map((l) => l.y + l.h / 2));
    cy = (min + max) / 2;
    cx = local.reduce((s, l) => s + l.x, 0) / local.length;
    height = max - min;
    width = Math.max(...local.map((l) => l.w));
  }
  const world = rot(cx, cy, f0.phi);
  return { x: p0.x + world.x, y: p0.y + world.y, rotation: f0.phi, width, height };
}

/** Agrupa las mesas de cada zona: los módulos pegados a otra mesa pasan a ser parte de ella. */
export function buildTableGroups(tables: Table[], zones: ZoneSize[]): { groups: TableGroup[]; byTable: Map<string, TableGroup> } {
  const groups: TableGroup[] = [];
  const byTable = new Map<string, TableGroup>();

  for (const zone of zones) {
    const list = tables.filter((t) => t.zoneId === zone.id);
    const parent = new Map<string, string>(list.map((t) => [t.id, t.id]));
    const find = (id: string): string => {
      let cur = id;
      while (parent.get(cur) !== cur) cur = parent.get(cur)!;
      return cur;
    };
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (attached(list[i]!, list[j]!, zone)) parent.set(find(list[i]!.id), find(list[j]!.id));
      }
    }
    const buckets = new Map<string, Table[]>();
    for (const t of list) buckets.set(find(t.id), [...(buckets.get(find(t.id)) ?? []), t]);

    for (const members of buckets.values()) {
      const sorted = [...members].sort((a, b) => compareTableNames(a.name, b.name));
      // La mesa "dueña": una mesa normal si hay (le llegó un módulo); si no, el número de la mesa larga con más módulos.
      const regular = sorted.find((t) => !t.layoutId);
      let label: string;
      if (regular) label = regular.name;
      else {
        const counts = new Map<string, number>();
        for (const t of sorted) counts.set(tableBaseName(t), (counts.get(tableBaseName(t)) ?? 0) + 1);
        label = [...counts.entries()].sort((a, b) => b[1] - a[1] || compareTableNames(a[0], b[0]))[0]![0];
      }
      const group: TableGroup = {
        id: sorted[0]!.id,
        zoneId: zone.id,
        label,
        capacity: sorted.reduce((s, t) => s + t.capacityMax, 0),
        members: sorted,
        merged: sorted.length >= 2 ? mergedGeometry(sorted, zone) : null,
      };
      groups.push(group);
      for (const t of sorted) byTable.set(t.id, group);
    }
  }
  return { groups, byTable };
}

/**
 * Imán entre mesas: al soltar un módulo cerca del borde de otra mesa (alineada con él), queda pegado y alineado.
 * Devuelve la posición en unidades de la zona, o null si no hay nada cerca.
 */
export function snapToNeighbor(table: Table, pos: { x: number; y: number }, others: Table[], zone: ZoneSize): { x: number; y: number } | null {
  if (table.shape === "round") return null;
  const ft = frameOf(table);
  let best: { gap: number; x: number; y: number } | null = null;
  for (const o of others) {
    if (o.id === table.id || o.shape === "round") continue;
    const fo = frameOf(o);
    if (!compatible(fo, ft)) continue;
    const oc = toZone(o, zone);
    const d = rot(pos.x - oc.x, pos.y - oc.y, -fo.phi);
    const alignY = (): number => {
      const edge = (fo.h - ft.h) / 2;
      if (Math.abs(d.y) < 14) return 0;
      if (Math.abs(d.y - edge) < 14) return edge;
      if (Math.abs(d.y + edge) < 14) return -edge;
      return d.y;
    };
    const alignX = (): number => {
      const edge = (fo.w - ft.w) / 2;
      if (Math.abs(d.x) < 14) return 0;
      if (Math.abs(d.x - edge) < 14) return edge;
      if (Math.abs(d.x + edge) < 14) return -edge;
      return d.x;
    };
    const candidates: { gap: number; x: number; y: number }[] = [];
    const gapX = Math.abs(d.x) - (fo.w + ft.w) / 2;
    if (Math.abs(gapX) < SNAP && Math.abs(d.y) < (fo.h + ft.h) / 2) {
      candidates.push({ gap: Math.abs(gapX), x: (Math.sign(d.x) || 1) * ((fo.w + ft.w) / 2), y: alignY() });
    }
    const gapY = Math.abs(d.y) - (fo.h + ft.h) / 2;
    if (Math.abs(gapY) < SNAP && Math.abs(d.x) < (fo.w + ft.w) / 2) {
      candidates.push({ gap: Math.abs(gapY), x: alignX(), y: (Math.sign(d.y) || 1) * ((fo.h + ft.h) / 2) });
    }
    for (const c of candidates) {
      if (!best || c.gap < best.gap) {
        const w = rot(c.x, c.y, fo.phi);
        best = { gap: c.gap, x: oc.x + w.x, y: oc.y + w.y };
      }
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * Para elegir mesa para un grupo de personas: un conjunto pegado (2 o más mesas) cuenta como UNA mesa del tamaño
 * total, así que no se le sienta un grupo chico. Con menos de 5 personas (o menos de la mitad de los asientos),
 * el conjunto no se ofrece.
 */
export function groupAcceptsParty(group: Pick<TableGroup, "capacity" | "members">, partySize: number): boolean {
  if (group.members.length < 2) return true;
  const minParty = Math.max(5, Math.floor(group.capacity / 2) + 1);
  return partySize >= minParty && partySize <= group.capacity;
}
