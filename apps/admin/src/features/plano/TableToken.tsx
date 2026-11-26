import { useEffect, useRef } from "react";
import Konva from "konva";
import { Circle, Ellipse, Group, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { tableBaseName, type Table, type Zone } from "@reservia/core";
import type { KonvaLook, VisualState } from "../../lib/stateStyle";
import type { MergedGeometry } from "./groups";
import { chairReach, chairSlots, type ChairSlot } from "./chairs";

/** Used only by the Smart Table Engine's floor-plan picker — undefined everywhere else, so the normal plano is untouched. */
export type TableHighlightState = "recommended" | "alternative" | "dimmed";

export interface TableInfoLine {
  text: string;
  /** En el color de alerta (ocupada hace mucho, reserva atrasada). */
  alert?: boolean;
}

/** Colores del tema ya resueltos a rgb() -- Konva no entiende var(). Los arma ZoneCanvas una vez por tema. */
export interface TablePalette {
  ink: string;
  ink2: string;
  acc: string;
  occ: string;
  free: string;
  arr: string;
  onS: string;
  /** Asiento de una silla y su borde/respaldo (sillas, sofás, barra). */
  seat: string;
  seatLine: string;
  /** Decoración: hojas claras y oscuras, maceta, madera, piedra. */
  leaf: string;
  leafDark: string;
  pot: string;
  wood: string;
  stone: string;
  shadow: string;
}

interface TableTokenProps {
  table: Table;
  zone: Zone;
  look: KonvaLook;
  /** Estado visual de la mesa: define cómo se ven sus sillas. */
  state: VisualState;
  /** Lados pegados a un sofá (ahí no van sillas). */
  coveredSides?: ReadonlySet<number>;
  /** Lados pegados a otro módulo de la misma mesa larga (esas sillas se reparten en los lados libres). */
  joinedSides?: ReadonlySet<number>;
  palette: TablePalette;
  selected: boolean;
  onSelect: () => void;
  /** Nombre que se muestra (por defecto el de la mesa): un módulo muestra el número de la mesa a la que pertenece. */
  label?: string;
  /** Asientos que se muestran en el rótulo (por defecto los de esta mesa). */
  labelCapacity?: number;
  /** Las sillas y el rótulo los dibuja el conjunto de módulos (ver ClusterChairs). */
  hideChairs?: boolean;
  hideLabel?: boolean;
  /** Personas sentadas ahora en esta mesa (se dibujan sobre las sillas). */
  guests?: number;
  draggable?: boolean;
  /** Fired with the new position in zone-local units (not %) so the caller converts once. */
  onDragEnd?: (x: number, y: number) => void;
  highlightState?: TableHighlightState;
  /** Alguien está sentado ahora y hay otra reserva por llegar pronto -- ver findTurnoverConflict. */
  turnoverWarning?: boolean;
  /** Línea viva bajo la mesa: tiempo sentados, hora de la reserva, "libre"... */
  info?: TableInfoLine;
  /** Mesa de una zona que no es la elegida -- se atenúa en vez de ocultarse. */
  dimmed?: boolean;
  /** Mientras se arrastra una persona de la lista de espera, las mesas libres se agrandan con halo verde. */
  dropReady?: boolean;
}

const RING_WIDTH = 3;
const SERIF = "Instrument Serif";
const SANS = "Instrument Sans";

export function TableToken({
  table,
  zone,
  look,
  state,
  coveredSides,
  joinedSides,
  palette,
  selected,
  onSelect,
  label,
  labelCapacity,
  hideChairs = false,
  hideLabel = false,
  guests = 0,
  draggable = false,
  onDragEnd,
  highlightState,
  turnoverWarning = false,
  info,
  dimmed = false,
  dropReady = false,
}: TableTokenProps) {
  const ringColor = highlightState === "recommended" ? palette.free : look.stroke;
  const strokeWidth = highlightState === "recommended" ? RING_WIDTH + 1.5 : RING_WIDTH;
  const groupOpacity = dimmed ? 0.2 : highlightState === "dimmed" ? 0.32 : 1;
  const isRound = table.shape === "round";
  const radius = Math.min(table.width, table.height) / 2;

  // positionX/Y are 0–100% of the zone's logical canvas, not absolute units.
  const x = (table.positionX / 100) * zone.width;
  const y = (table.positionY / 100) * zone.height;

  function handleDragEnd(e: KonvaEventObject<DragEvent>) {
    onDragEnd?.(e.target.x(), e.target.y());
  }

  const fillProps = look.pattern
    ? { fillPatternImage: look.pattern as unknown as HTMLImageElement, fillPatternRepeat: "repeat" }
    : look.fill
      ? { fill: look.fill }
      : {};

  const solid = Boolean(look.fill || look.pattern);

  const shapeProps = {
    ...fillProps,
    stroke: ringColor,
    strokeWidth,
    dash: look.dash,
    // Un poco de sombra le da cuerpo a la mesa; en las libres (solo contorno punteado) se omite.
    ...(solid ? { shadowColor: palette.shadow, shadowBlur: 9, shadowOffsetY: 3, shadowOpacity: 0.55, shadowForStrokeEnabled: false } : {}),
  };

  const haloColor = dropReady ? palette.free : look.halo;
  const chairs = chairSlots(table, coveredSides, joinedSides);
  const reach = chairReach(table);

  return (
    <Group
      x={x}
      y={y}
      rotation={table.rotation}
      opacity={groupOpacity}
      scaleX={dropReady ? 1.08 : 1}
      scaleY={dropReady ? 1.08 : 1}
      onClick={onSelect}
      onTap={onSelect}
      draggable={draggable}
      onDragEnd={handleDragEnd}
      listening
    >
      {!hideChairs && (
        <>
          {chairs.map((slot, i) => (
            <Chair key={i} slot={slot} state={state} stroke={look.stroke} palette={palette} />
          ))}
          <Guests slots={chairs} count={guests} palette={palette} seed={table.id} />
        </>
      )}

      {haloColor &&
        (isRound ? (
          <Circle radius={radius + 6} fill={haloColor} opacity={dropReady ? 0.3 : 1} />
        ) : (
          <Rect
            x={-table.width / 2 - 6}
            y={-table.height / 2 - 6}
            width={table.width + 12}
            height={table.height + 12}
            cornerRadius={16}
            fill={haloColor}
            opacity={dropReady ? 0.3 : 1}
          />
        ))}

      {isRound ? (
        <Circle radius={radius} {...shapeProps} />
      ) : (
        <Rect
          x={-table.width / 2}
          y={-table.height / 2}
          width={table.width}
          height={table.height}
          cornerRadius={12}
          {...shapeProps}
        />
      )}

      {solid &&
        (isRound ? (
          <Circle radius={radius - 6} stroke={palette.seatLine} strokeWidth={1} opacity={0.5} listening={false} />
        ) : (
          <Rect
            x={-table.width / 2 + 6}
            y={-table.height / 2 + 6}
            width={table.width - 12}
            height={table.height - 12}
            cornerRadius={7}
            stroke={palette.seatLine}
            strokeWidth={1}
            opacity={0.5}
            listening={false}
          />
        ))}

      {highlightState === "recommended" && (
        <Text
          text="RECOMENDADA"
          fontSize={10}
          fontFamily={SANS}
          fontStyle="700"
          letterSpacing={0.6}
          fill={palette.free}
          width={table.width + 40}
          align="center"
          offsetX={(table.width + 40) / 2}
          y={-table.height / 2 - 24}
          rotation={-table.rotation}
        />
      )}

      {turnoverWarning && (
        <Group x={table.width / 2} y={-table.height / 2} rotation={-table.rotation}>
          <Circle radius={10} fill={palette.arr} />
          <Text
            text="!"
            fontSize={13}
            fontFamily={SANS}
            fontStyle="700"
            fill={palette.onS}
            width={20}
            height={20}
            align="center"
            verticalAlign="middle"
            offsetX={10}
            offsetY={10}
          />
        </Group>
      )}

      {selected && (
        <>
          {isRound ? (
            <Circle radius={radius + 4 + RING_WIDTH / 2} stroke={palette.ink} strokeWidth={3} />
          ) : (
            <Rect
              x={-table.width / 2 - 4 - RING_WIDTH / 2}
              y={-table.height / 2 - 4 - RING_WIDTH / 2}
              width={table.width + 8 + RING_WIDTH}
              height={table.height + 8 + RING_WIDTH}
              cornerRadius={15}
              stroke={palette.ink}
              strokeWidth={3}
            />
          )}
        </>
      )}

      {!hideLabel && (
        <>
          <Text
            text={label ?? table.name}
            fontSize={22}
            fontFamily={SERIF}
            fill={look.text}
            width={table.width}
            align="center"
            offsetX={table.width / 2}
            y={-17}
            rotation={-table.rotation}
          />
          <Text
            text={`${labelCapacity ?? table.capacityMax}p`}
            fontSize={12}
            fontFamily={SANS}
            fontStyle="600"
            fill={look.text}
            width={table.width}
            align="center"
            offsetX={table.width / 2}
            y={6}
            rotation={-table.rotation}
          />
        </>
      )}

      {info && (
        <Text
          text={info.text}
          fontSize={13}
          fontFamily={SANS}
          fontStyle="600"
          fill={info.alert ? palette.occ : palette.ink2}
          width={Math.max(table.width + 40, 90)}
          align="center"
          offsetX={Math.max(table.width + 40, 90) / 2}
          y={Math.max(table.width, table.height) / 2 + reach + 8}
          rotation={-table.rotation}
          listening={false}
        />
      )}
    </Group>
  );
}

/** Silla vista desde arriba: respaldo (borde exterior) + asiento. Su color sigue el estado de la mesa. */
function Chair({ slot, state, stroke, palette }: { slot: ChairSlot; state: VisualState; stroke: string; palette: TablePalette }) {
  const { width: cw, depth: cd } = slot;
  const back = Math.max(2.5, cd * 0.34);
  const strong = state === "occupied" || state === "paying";
  const opacity = state === "blocked" || state === "noshow" ? 0.35 : state === "free" ? 0.8 : 1;

  return (
    <Group x={slot.x} y={slot.y} rotation={slot.rotation} opacity={opacity} listening={false}>
      <Rect
        x={-cw / 2}
        y={-cd / 2}
        width={cw}
        height={back}
        cornerRadius={[back * 0.7, back * 0.7, 1, 1]}
        fill={strong ? stroke : palette.seatLine}
        opacity={strong ? 1 : 0.9}
      />
      <Rect
        x={-cw / 2 + 0.75}
        y={-cd / 2 + back}
        width={cw - 1.5}
        height={cd - back}
        cornerRadius={[2, 2, cd * 0.32, cd * 0.32]}
        fill={strong ? stroke : palette.seat}
        opacity={strong ? 0.78 : 1}
        stroke={strong ? undefined : stroke}
        strokeWidth={strong ? 0 : 1}
      />
    </Group>
  );
}

/** El lugar de origen de un módulo que se apartó: un hueco punteado donde vuelve con "Devolver a su lugar". */
export function HomeSlot({ table, zone, palette }: { table: Table; zone: Zone; palette: TablePalette }) {
  if (table.homeX == null || table.homeY == null) return null;
  const w = table.homeWidth ?? table.width;
  const h = table.homeHeight ?? table.height;
  return (
    <Group x={(table.homeX / 100) * zone.width} y={(table.homeY / 100) * zone.height} rotation={table.homeRotation ?? 0} listening={false}>
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={8} stroke={palette.seatLine} strokeWidth={1.5} dash={[5, 4]} opacity={0.8} />
      <Text
        text={`↩ ${tableBaseName(table)}`}
        fontSize={12}
        fontFamily={SANS}
        fontStyle="600"
        fill={palette.seatLine}
        width={Math.max(w, 60)}
        align="center"
        offsetX={Math.max(w, 60) / 2}
        y={-6}
        rotation={-(table.homeRotation ?? 0)}
      />
    </Group>
  );
}

// ---------------------------------------------------------------- personas sentadas

const SKIN = ["#e8c4a0", "#d9a578", "#b9794f", "#8f5a3b", "#f0d3b5"];
const SHIRT = ["#c9824b", "#5b8fb9", "#b95b7a", "#6aa36f", "#d1b24a", "#8c6bb1", "#c4585a", "#4f9a9a"];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Qué sillas ocupar: repartidas alrededor de la mesa (dos personas quedan una frente a la otra, no una al lado de la otra). */
export function pickGuestSlots(slots: ChairSlot[], count: number): ChairSlot[] {
  const n = Math.min(count, slots.length);
  if (n <= 0) return [];
  const ring = [...slots].sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  const chosen = new Set<number>();
  for (let i = 0; i < n; i++) chosen.add(Math.round((i * ring.length) / n) % ring.length);
  // Por si el redondeo repitió alguna: completa con las que falten.
  for (let i = 0; chosen.size < n && i < ring.length; i++) chosen.add(i);
  return [...chosen].map((i) => ring[i]!);
}

/** Una persona sentada vista desde arriba: hombros y cabeza sobre la silla, mirando a la mesa. Aparece con un saltito. */
function Person({ slot, seed, index, outline }: { slot: ChairSlot; seed: string; index: number; outline: string }) {
  const ref = useRef<Konva.Group>(null);
  const h = hash(`${seed}:${index}`);
  const skin = SKIN[h % SKIN.length]!;
  const shirt = SHIRT[(h >> 3) % SHIRT.length]!;
  const { width: cw, depth: cd } = slot;
  const headR = Math.max(3, Math.min(cw, cd) * 0.27);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    node.scale({ x: 0.2, y: 0.2 });
    node.opacity(0);
    const tween = new Konva.Tween({ node, scaleX: 1, scaleY: 1, opacity: 1, duration: 0.34, easing: Konva.Easings.BackEaseOut });
    const timer = window.setTimeout(() => tween.play(), 60 + index * 70);
    return () => {
      window.clearTimeout(timer);
      tween.destroy();
    };
  }, [index]);

  return (
    <Group x={slot.x} y={slot.y} rotation={slot.rotation} listening={false}>
      <Group ref={ref}>
        <Ellipse x={0} y={-cd * 0.08} radiusX={cw * 0.46} radiusY={cd * 0.3} fill={shirt} stroke={outline} strokeWidth={0.6} />
        <Circle x={0} y={cd * 0.1} radius={headR} fill={skin} stroke={outline} strokeWidth={0.6} />
      </Group>
    </Group>
  );
}

function Guests({ slots, count, palette, seed }: { slots: ChairSlot[]; count: number; palette: TablePalette; seed: string }) {
  if (count <= 0) return null;
  return (
    <>
      {pickGuestSlots(slots, count).map((slot, i) => (
        <Person key={`${slot.x}:${slot.y}`} slot={slot} seed={seed} index={i} outline={palette.shadow} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- mesa hecha de módulos

export interface ClusterMember {
  table: Table;
  state: VisualState;
  stroke: string;
  guests: number;
}

/**
 * Las sillas de una mesa hecha de módulos pegados en hilera: se dibujan como UNA mesa larga (una silla en cada
 * cabecera y el resto repartido en los dos lados largos), no módulo por módulo. Cada silla toma el estado del
 * módulo al que está más cerca.
 */
export function ClusterChairs({
  geometry,
  members,
  dropSides,
  palette,
  dimmed,
  zone,
}: {
  geometry: MergedGeometry;
  members: ClusterMember[];
  dropSides?: ReadonlySet<number>;
  palette: TablePalette;
  dimmed: boolean;
  zone: Pick<Zone, "width" | "height">;
}) {
  const capacity = members.reduce((s, m) => s + m.table.capacityMax, 0);
  const slots = chairSlots({ shape: "rectangle", width: geometry.width, height: geometry.height, capacityMax: capacity }, dropSides);

  // Centro de cada módulo en el marco de la mesa unida.
  const offsets = members.map((m) => {
    const dx = (m.table.positionX / 100) * zone.width - geometry.x;
    const dy = (m.table.positionY / 100) * zone.height - geometry.y;
    const r = (-geometry.rotation * Math.PI) / 180;
    return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
  });
  const memberOf = (slot: ChairSlot): number => {
    let best = 0;
    let bestD = Infinity;
    offsets.forEach((o, i) => {
      const d = (o.x - slot.x) ** 2 + (o.y - slot.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  const owners = slots.map(memberOf);

  return (
    <Group x={geometry.x} y={geometry.y} rotation={geometry.rotation} opacity={dimmed ? 0.2 : 1} listening={false}>
      {slots.map((slot, i) => (
        <Chair key={i} slot={slot} state={members[owners[i]!]!.state} stroke={members[owners[i]!]!.stroke} palette={palette} />
      ))}
      {members.map((m, mi) => {
        const mine = slots.filter((_, i) => owners[i] === mi);
        return <Guests key={m.table.id} slots={mine} count={m.guests} palette={palette} seed={m.table.id} />;
      })}
    </Group>
  );
}

/** Número y asientos de toda la mesa unida, en el centro (sin girar). */
export function ClusterLabel({ geometry, label, capacity, color }: { geometry: MergedGeometry; label: string; capacity: number; color: string }) {
  const w = Math.max(geometry.width, geometry.height);
  return (
    <Group x={geometry.x} y={geometry.y} listening={false}>
      <Text text={label} fontSize={22} fontFamily={SERIF} fill={color} width={w} align="center" offsetX={w / 2} y={-17} />
      <Text text={`${capacity}p`} fontSize={12} fontFamily={SANS} fontStyle="600" fill={color} width={w} align="center" offsetX={w / 2} y={6} />
    </Group>
  );
}
