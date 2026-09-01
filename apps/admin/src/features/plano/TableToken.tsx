import { Circle, Group, Rect, Text } from "react-konva";
import { computeSeats, tableStatusLabel, type Table, type TableLiveStatusValue, type Zone } from "@reservia/core";
import { STATUS_COLORS } from "./statusColors";

interface TableTokenProps {
  table: Table;
  zone: Zone;
  /** Fase 4 wires real live status; until then every table reads as available. */
  status?: TableLiveStatusValue;
  selected: boolean;
  onSelect: () => void;
}

const SEAT_RADIUS = 4;
const RING_WIDTH = 3;

export function TableToken({ table, zone, status = "available", selected, onSelect }: TableTokenProps) {
  const seats = computeSeats({
    shape: table.shape,
    capacity: table.capacityMax,
    width: table.width,
    height: table.height,
  });
  const ringColor = STATUS_COLORS[status];

  // positionX/Y are 0–100% of the zone's logical canvas, not absolute units.
  const x = (table.positionX / 100) * zone.width;
  const y = (table.positionY / 100) * zone.height;

  return (
    <Group
      x={x}
      y={y}
      rotation={table.rotation}
      onClick={onSelect}
      onTap={onSelect}
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
          strokeWidth={RING_WIDTH}
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
          strokeWidth={RING_WIDTH}
          shadowColor="#000"
          shadowBlur={10}
          shadowOpacity={0.4}
          shadowOffsetY={4}
        />
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
