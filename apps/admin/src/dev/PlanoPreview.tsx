import { useState } from "react";
import type { Table, Zone, ZoneDecor, TableLiveStatusValue } from "@reservia/core";
import { DECOR_META, type DecorKind } from "@reservia/core";
import { ZoneCanvas } from "../features/plano/ZoneCanvas";

/** SOLO DESARROLLO (ruta /__plano): dibuja el plano con datos de ejemplo, sin iniciar sesión, para revisar sillas y decoración. */
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const zone: Zone = { id: ID(1), restaurantId: ID(9), name: "Salón Principal", type: "salon", sortOrder: 0, width: 1000, height: 700, active: true };

function table(n: number, name: string, shape: Table["shape"], cap: number, x: number, y: number, w: number, h: number, rotation = 0): Table {
  return { id: ID(100 + n), restaurantId: ID(9), zoneId: zone.id, name, number: n, shape, capacityMin: 1, capacityMax: cap, positionX: x, positionY: y, width: w, height: h, rotation, active: true, joinable: false, blocked: false, blockedReason: null };
}

const tables: Table[] = [
  table(1, "1", "round", 2, 14, 24, 56, 56),
  table(2, "2", "round", 4, 30, 24, 80, 80),
  table(3, "3", "square", 4, 48, 24, 84, 84),
  table(4, "4", "rectangle", 6, 68, 26, 120, 76),
  table(5, "5", "rectangle", 10, 56, 62, 190, 84),
  table(6, "6", "round", 6, 22, 62, 100, 100),
  table(8, "8", "square", 8, 40, 86, 110, 110),
];
/** Mesa larga dividida en módulos dentro de su misma huella (igual que split_table_into_modules). */
function modules(prefix: string, idBase: number, caps: number[], cx: number, cy: number, totalW: number, h: number, detachIndex = -1): Table[] {
  const total = caps.reduce((a, b) => a + b, 0);
  let acc = 0;
  return caps.map((cap, i) => {
    const w = (totalW * cap) / total;
    const off = -totalW / 2 + (totalW * acc) / total + w / 2;
    acc += cap;
    const homeX = cx + off / 10;
    const t: Table = {
      ...table(idBase + i, `${prefix}-${"ABC"[i]}`, "rectangle", cap, homeX, cy, w, h),
      layoutId: ID(900 + idBase),
      joinable: true,
      homeX,
      homeY: cy,
      homeRotation: 0,
      homeWidth: w,
      homeHeight: h,
    };
    return i === detachIndex ? { ...t, positionX: homeX + 9, positionY: cy + 15 } : t;
  });
}

const longTables: Table[] = [...modules("12", 20, [4, 4, 2], 78, 46, 240, 56), ...modules("13", 30, [4, 4, 2], 78, 74, 240, 56, 2)];
tables.push(...longTables);

const status: Record<string, TableLiveStatusValue> = {
  [ID(120)]: "occupied",
  [ID(121)]: "occupied",
  [ID(122)]: "reserved",
  [ID(130)]: "available",
  [ID(131)]: "reserved",
  [ID(101)]: "available",
  [ID(102)]: "occupied",
  [ID(103)]: "reserved",
  [ID(104)]: "arriving",
  [ID(105)]: "occupied",
  [ID(106)]: "paying",
  [ID(107)]: "blocked",
  [ID(108)]: "reserved",
  [ID(109)]: "available",
};

function d(n: number, kind: DecorKind, x: number, y: number, rotation = 0, scale = 1): ZoneDecor {
  const m = DECOR_META[kind];
  return { id: ID(200 + n), restaurantId: ID(9), zoneId: zone.id, kind, positionX: x, positionY: y, width: m.width * scale, height: m.height * scale, rotation };
}

const initialDecor: ZoneDecor[] = [
  d(1, "tree", 6, 8),
  d(2, "plant", 94, 8),
  d(3, "planter", 50, 5),
  d(4, "column", 24, 42),
  d(5, "column", 64, 44),
  d(6, "wall", 50, 47, 0, 2.2),
  d(7, "door", 95, 96, 0),
  d(8, "bar", 80, 8, 0, 1),
  d(9, "sofa", 8, 94),
  { ...d(12, "sofa", 27, 14), width: 340, height: 46 },
  d(10, "plant", 94, 52),
  d(11, "plant", 6, 50),
];

export function PlanoPreview() {
  const edit = new URLSearchParams(window.location.search).get("edit") === "1";
  const [selectedDecor, setSelectedDecor] = useState<string | null>(null);
  const [decor, setDecor] = useState(initialDecor);
  return (
    <div style={{ height: "100vh", padding: 12 }}>
      <ZoneCanvas
        zones={[zone]}
        tables={tables}
        selectedTableId={null}
        onSelectTable={() => undefined}
        getTableStatus={(id) => status[id] ?? "available"}
        getTableInfo={(id) => (id === ID(102) ? { text: "45 min" } : id === ID(103) ? { text: "20:30 · Pérez" } : undefined)}
        getTableGuests={(id) => ({ [ID(120)]: 4, [ID(121)]: 3, [ID(102)]: 2, [ID(105)]: 4, [ID(106)]: 5 })[id] ?? 0}
        decor={decor}
        decorEditable={edit}
        selectedDecorId={selectedDecor}
        onSelectDecor={setSelectedDecor}
        onMoveDecor={(id, x, y) => setDecor((prev) => prev.map((p) => (p.id === id ? { ...p, positionX: x, positionY: y } : p)))}
      />
    </div>
  );
}
