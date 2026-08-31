import type { TableShape } from "../types/floorplan";

export interface SeatLayoutInput {
  shape: TableShape;
  capacity: number;
  /** Table bounding box, in the same units as the zone canvas. */
  width: number;
  height: number;
  /** Gap between the table edge and the seat marker. */
  seatGap?: number;
}

export interface SeatPosition {
  /** Offset from the table's center, same units as width/height. */
  x: number;
  y: number;
  /** Degrees — points the seat marker outward from the table. */
  angle: number;
}

/**
 * Derives seat positions from a table's shape and capacity. Nothing here is
 * persisted — the floor plan calls this at render time, so adding a chair is
 * just raising `capacity_max`, never a row in a "seats" table.
 */
export function computeSeats(input: SeatLayoutInput): SeatPosition[] {
  const { shape, capacity, width, height, seatGap = 14 } = input;
  if (capacity <= 0) return [];

  return shape === "round"
    ? computeRoundSeats(capacity, Math.max(width, height) / 2, seatGap)
    : computeRectSeats(capacity, width, height, seatGap);
}

function computeRoundSeats(capacity: number, radius: number, gap: number): SeatPosition[] {
  const seatRadius = radius + gap;
  return Array.from({ length: capacity }, (_, i) => {
    const angle = (360 / capacity) * i - 90; // start at the top, go clockwise
    const rad = (angle * Math.PI) / 180;
    return { x: seatRadius * Math.cos(rad), y: seatRadius * Math.sin(rad), angle: angle + 90 };
  });
}

/**
 * Distributes seats across the four sides of a square/rectangle, longest
 * sides first, cycling round-robin so an 8-top on a rectangle fills both
 * long sides before doubling up on the short ones.
 */
function computeRectSeats(capacity: number, width: number, height: number, gap: number): SeatPosition[] {
  type Side = "top" | "right" | "bottom" | "left";
  const sideLength: Record<Side, number> = { top: width, bottom: width, left: height, right: height };
  const sidesByLength = (Object.keys(sideLength) as Side[]).sort((a, b) => sideLength[b] - sideLength[a]);

  const seatsPerSide: Record<Side, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  for (let i = 0; i < capacity; i++) {
    // sidesByLength always holds all 4 sides, so this index is never out of bounds.
    const side = sidesByLength[i % sidesByLength.length] as Side;
    seatsPerSide[side]++;
  }

  const positions: SeatPosition[] = [];
  for (const side of sidesByLength) {
    const count = seatsPerSide[side];
    for (let i = 0; i < count; i++) {
      positions.push(seatOnSide(side, i, count, width, height, gap));
    }
  }
  return positions;
}

function seatOnSide(
  side: "top" | "right" | "bottom" | "left",
  index: number,
  countOnSide: number,
  width: number,
  height: number,
  gap: number,
): SeatPosition {
  // Evenly space seats along the side, inset from the corners.
  const t = (index + 1) / (countOnSide + 1);
  const halfW = width / 2;
  const halfH = height / 2;

  switch (side) {
    case "top":
      return { x: -halfW + t * width, y: -halfH - gap, angle: 0 };
    case "bottom":
      return { x: -halfW + t * width, y: halfH + gap, angle: 180 };
    case "left":
      return { x: -halfW - gap, y: -halfH + t * height, angle: 270 };
    case "right":
      return { x: halfW + gap, y: -halfH + t * height, angle: 90 };
  }
}
