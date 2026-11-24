import { Circle, Group, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table, Zone } from "@reservia/core";
import type { KonvaLook, VisualState } from "../../lib/stateStyle";
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
  palette: TablePalette;
  selected: boolean;
  onSelect: () => void;
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
  palette,
  selected,
  onSelect,
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
  const chairs = chairSlots(table, coveredSides);
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
      {chairs.map((slot, i) => (
        <Chair key={i} slot={slot} state={state} stroke={look.stroke} palette={palette} />
      ))}

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

      <Text
        text={table.name}
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
        text={`${table.capacityMax}p`}
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
