import { Circle, Group, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table, Zone } from "@reservia/core";
import type { KonvaLook } from "../../lib/stateStyle";

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
}

interface TableTokenProps {
  table: Table;
  zone: Zone;
  look: KonvaLook;
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

  const shapeProps = {
    ...fillProps,
    stroke: ringColor,
    strokeWidth,
    dash: look.dash,
  };

  const haloColor = dropReady ? palette.free : look.halo;

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
          y={Math.max(table.width, table.height) / 2 + 10}
          rotation={-table.rotation}
          listening={false}
        />
      )}
    </Group>
  );
}
