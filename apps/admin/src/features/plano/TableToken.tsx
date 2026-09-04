import { Circle, Group, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { computeSeats, tableStatusLabel, type Table, type TableLiveStatusValue, type Zone } from "@reservia/core";
import { STATUS_COLORS } from "./statusColors";

/** Used only by the Smart Table Engine's floor-plan picker — undefined everywhere else, so the normal plano is untouched. */
export type TableHighlightState = "recommended" | "alternative" | "dimmed";

interface TableTokenProps {
  table: Table;
  zone: Zone;
  /** Fase 4 wires real live status; until then every table reads as available. */
  status?: TableLiveStatusValue;
  selected: boolean;
  onSelect: () => void;
  draggable?: boolean;
  /** Fired with the new position in zone-local units (not %) so the caller converts once. */
  onDragEnd?: (x: number, y: number) => void;
  highlightState?: TableHighlightState;
  /** Alguien está sentado ahora y hay otra reserva por llegar pronto -- ver findTurnoverConflict. */
  turnoverWarning?: boolean;
}

const SEAT_RADIUS = 4;
const RING_WIDTH = 3;
const RECOMMENDED_COLOR = "#4cae83";
const TURNOVER_BADGE_COLOR = "#e0ac4e";

export function TableToken({
  table,
  zone,
  status = "available",
  selected,
  onSelect,
  draggable = false,
  onDragEnd,
  highlightState,
  turnoverWarning = false,
}: TableTokenProps) {
  const seats = computeSeats({
    shape: table.shape,
    capacity: table.capacityMax,
    width: table.width,
    height: table.height,
  });
  const ringColor = highlightState === "recommended" ? RECOMMENDED_COLOR : STATUS_COLORS[status];
  const groupOpacity = highlightState === "dimmed" ? 0.32 : 1;

  // positionX/Y are 0–100% of the zone's logical canvas, not absolute units.
  const x = (table.positionX / 100) * zone.width;
  const y = (table.positionY / 100) * zone.height;

  function handleDragEnd(e: KonvaEventObject<DragEvent>) {
    onDragEnd?.(e.target.x(), e.target.y());
  }

  return (
    <Group
      x={x}
      y={y}
      rotation={table.rotation}
      opacity={groupOpacity}
      onClick={onSelect}
      onTap={onSelect}
      draggable={draggable}
      onDragEnd={handleDragEnd}
      listening
    >
      {/* Ambient glow in the status color — reads at a glance, before the ring registers. */}
      {table.shape === "round" ? (
        <Circle
          radius={Math.min(table.width, table.height) / 2 + 6}
          fill={ringColor}
          opacity={0.16}
          shadowColor={ringColor}
          shadowBlur={18}
          shadowOpacity={0.55}
        />
      ) : (
        <Rect
          x={-table.width / 2 - 6}
          y={-table.height / 2 - 6}
          width={table.width + 12}
          height={table.height + 12}
          cornerRadius={10}
          fill={ringColor}
          opacity={0.16}
          shadowColor={ringColor}
          shadowBlur={18}
          shadowOpacity={0.55}
        />
      )}

      {seats.map((seat, i) => (
        <Rect
          key={i}
          x={seat.x - SEAT_RADIUS}
          y={seat.y - SEAT_RADIUS}
          width={SEAT_RADIUS * 2}
          height={SEAT_RADIUS * 2}
          cornerRadius={2.5}
          fill="#2c2419"
          stroke="#4a3f31"
          strokeWidth={0.75}
        />
      ))}

      {table.shape === "round" ? (
        <Circle
          radius={Math.min(table.width, table.height) / 2}
          fillLinearGradientStartPoint={{ x: -table.width / 2, y: -table.height / 2 }}
          fillLinearGradientEndPoint={{ x: table.width / 2, y: table.height / 2 }}
          fillLinearGradientColorStops={[0, "#4a3826", 1, "#2b2015"]}
          stroke={ringColor}
          strokeWidth={highlightState === "recommended" ? RING_WIDTH + 1.5 : RING_WIDTH}
          shadowColor="#000"
          shadowBlur={10}
          shadowOpacity={0.4}
          shadowOffsetY={4}
        />
      ) : (
        <Rect
          x={-table.width / 2}
          y={-table.height / 2}
          width={table.width}
          height={table.height}
          cornerRadius={6}
          fillLinearGradientStartPoint={{ x: -table.width / 2, y: -table.height / 2 }}
          fillLinearGradientEndPoint={{ x: table.width / 2, y: table.height / 2 }}
          fillLinearGradientColorStops={[0, "#4a3826", 1, "#2b2015"]}
          stroke={ringColor}
          strokeWidth={highlightState === "recommended" ? RING_WIDTH + 1.5 : RING_WIDTH}
          shadowColor="#000"
          shadowBlur={10}
          shadowOpacity={0.4}
          shadowOffsetY={4}
        />
      )}

      {highlightState === "recommended" && (
        <Text
          text="RECOMENDADA"
          fontSize={9}
          fontStyle="700"
          letterSpacing={0.5}
          fill={RECOMMENDED_COLOR}
          width={table.width + 40}
          align="center"
          offsetX={(table.width + 40) / 2}
          y={-table.height / 2 - 22}
          rotation={-table.rotation}
        />
      )}

      {turnoverWarning && (
        <Group x={table.width / 2} y={-table.height / 2} rotation={-table.rotation}>
          <Circle
            radius={9}
            fill={TURNOVER_BADGE_COLOR}
            stroke="#2c2419"
            strokeWidth={1.5}
            shadowColor="#000"
            shadowBlur={4}
            shadowOpacity={0.4}
          />
          <Text
            text="!"
            fontSize={12}
            fontStyle="700"
            fill="#2c2419"
            width={18}
            height={18}
            align="center"
            verticalAlign="middle"
            offsetX={9}
            offsetY={9}
          />
        </Group>
      )}

      {selected && (
        <Rect
          x={-table.width / 2 - 6}
          y={-table.height / 2 - 6}
          width={table.width + 12}
          height={table.height + 12}
          cornerRadius={8}
          stroke="#de9a4c"
          strokeWidth={1.5}
          dash={[4, 3]}
        />
      )}

      <Text
        text={table.name}
        fontSize={13}
        fontStyle="600"
        fill="#f3eee4"
        width={table.width}
        align="center"
        offsetX={table.width / 2}
        y={-9}
        rotation={-table.rotation}
      />
      <Text
        text={`${table.capacityMax}p · ${tableStatusLabel(status)}`}
        fontSize={10}
        fill="#8a7f6d"
        width={table.width}
        align="center"
        offsetX={table.width / 2}
        y={7}
        rotation={-table.rotation}
      />
    </Group>
  );
}
