import { Circle, Group, Rect, Text } from "react-konva";
import { computeSeats, tableStatusLabel, type Table, type TableLiveStatusValue } from "@reservia/core";
import { STATUS_COLORS } from "./statusColors";

interface TableTokenProps {
  table: Table;
  /** Fase 4 wires real live status; until then every table reads as available. */
  status?: TableLiveStatusValue;
  selected: boolean;
  onSelect: () => void;
}

const SEAT_RADIUS = 4;
const RING_WIDTH = 3;

export function TableToken({ table, status = "available", selected, onSelect }: TableTokenProps) {
  const seats = computeSeats({
    shape: table.shape,
    capacity: table.capacityMax,
    width: table.width,
    height: table.height,
  });
  const ringColor = STATUS_COLORS[status];

  return (
    <Group
      x={table.positionX}
      y={table.positionY}
      rotation={table.rotation}
      onClick={onSelect}
      onTap={onSelect}
      listening
    >
      {seats.map((seat, i) => (
        <Circle key={i} x={seat.x} y={seat.y} radius={SEAT_RADIUS} fill="#39332b" />
      ))}

      {table.shape === "round" ? (
        <Circle
          radius={Math.min(table.width, table.height) / 2}
          fill="#1c1916"
          stroke={ringColor}
          strokeWidth={RING_WIDTH}
        />
      ) : (
        <Rect
          x={-table.width / 2}
          y={-table.height / 2}
          width={table.width}
          height={table.height}
          cornerRadius={6}
          fill="#1c1916"
          stroke={ringColor}
          strokeWidth={RING_WIDTH}
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
