import { useEffect, useMemo, useRef } from "react";
import { Stage, Layer, Rect, Text, Circle, Group } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table, TableLiveStatusValue, Zone } from "@reservia/core";
import { useContainerSize } from "../../hooks/useContainerSize";
import { TableToken } from "./TableToken";

const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
const FLOOR_MARGIN = 0.94; // leaves breathing room around the floor at fit-to-screen
const ZONE_GAP = 40;
const COMMON_HEIGHT = 700; // every zone is rescaled to this height so they tile in one row cleanly

interface ZoneLayout {
  zone: Zone;
  offsetX: number;
  scale: number;
}

interface ZoneCanvasProps {
  /** One zone (a single tab) or several (the unified "Todo" floor) — same component either way. */
  zones: Zone[];
  tables: Table[];
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
  onMoveTable?: (tableId: string, positionX: number, positionY: number) => void;
  getTableStatus?: (tableId: string) => TableLiveStatusValue;
}

export function ZoneCanvas({
  zones,
  tables,
  selectedTableId,
  onSelectTable,
  onMoveTable,
  getTableStatus,
}: ZoneCanvasProps) {
  const { ref: containerRef, width, height } = useContainerSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage | null>(null);

  // Each zone keeps its own aspect ratio but is rescaled to a shared height,
  // then laid out left to right — this is what makes "Todo" read as one
  // floor instead of a grid of unrelated boxes.
  const layout = useMemo<ZoneLayout[]>(() => {
    let cursor = 0;
    return zones.map((zone) => {
      const scale = COMMON_HEIGHT / zone.height;
      const entry = { zone, offsetX: cursor, scale };
      cursor += zone.width * scale + ZONE_GAP;
      return entry;
    });
  }, [zones]);

  const floorWidth = layout.length
    ? layout[layout.length - 1]!.offsetX + layout[layout.length - 1]!.zone.width * layout[layout.length - 1]!.scale
    : 0;
  const floorHeight = COMMON_HEIGHT;

  const tablesByZone = useMemo(() => {
    const map = new Map<string, Table[]>();
    for (const table of tables) map.set(table.zoneId, [...(map.get(table.zoneId) ?? []), table]);
    return map;
  }, [tables]);

  const fitToScreen = () => {
    const stage = stageRef.current;
    if (!stage || width === 0 || height === 0 || floorWidth === 0) return;
    const scale = Math.min(width / floorWidth, height / floorHeight) * FLOOR_MARGIN;
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (width - floorWidth * scale) / 2,
      y: (height - floorHeight * scale) / 2,
    });
    stage.batchDraw();
  };

  // Re-fit whenever the panel is resized or the set of zones on screen changes.
  useEffect(fitToScreen, [width, height, floorWidth, floorHeight]);

  function handleWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = stage.scaleX();
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = clamp(oldScale * (1 + direction * 0.08), MIN_SCALE, MAX_SCALE);

    const pointerFloorPos = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - pointerFloorPos.x * newScale,
      y: pointer.y - pointerFloorPos.y * newScale,
    });
    stage.batchDraw();
  }

  function zoomBy(factor: number) {
    const stage = stageRef.current;
    if (!stage || width === 0 || height === 0) return;
    const oldScale = stage.scaleX();
    const newScale = clamp(oldScale * factor, MIN_SCALE, MAX_SCALE);
    const center = { x: width / 2, y: height / 2 };
    const centerFloorPos = { x: (center.x - stage.x()) / oldScale, y: (center.y - stage.y()) / oldScale };

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: center.x - centerFloorPos.x * newScale,
      y: center.y - centerFloorPos.y * newScale,
    });
    stage.batchDraw();
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <Stage
        ref={stageRef}
        width={width || 1}
        height={height || 1}
        onWheel={handleWheel}
        onClick={(e) => {
          if (e.target === e.target.getStage()) onSelectTable(null);
        }}
      >
        <Layer listening={false}>
          {layout.map(({ zone, offsetX, scale }) => (
            <Group key={zone.id} x={offsetX} scaleX={scale} scaleY={scale}>
              <Rect
                x={0}
                y={0}
                width={zone.width}
                height={zone.height}
                cornerRadius={16}
                fillRadialGradientStartPoint={{ x: zone.width / 2, y: zone.height / 2 }}
                fillRadialGradientEndPoint={{ x: zone.width / 2, y: zone.height / 2 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndRadius={Math.max(zone.width, zone.height) * 0.75}
                fillRadialGradientColorStops={[0, "#3c352b", 1, "#252019"]}
              />
              <WoodFloor width={zone.width} height={zone.height} />
              <PottedPlant x={zone.width * 0.06} y={zone.height * 0.08} scale={Math.min(zone.width, zone.height) / 22} />
              <PottedPlant
                x={zone.width * 0.94}
                y={zone.height * 0.93}
                scale={Math.min(zone.width, zone.height) / 26}
              />
              <ZoneLabel text={zone.name} x={zone.width * 0.5} y={zone.height * 0.06} />
            </Group>
          ))}
        </Layer>
        <Layer>
          {layout.map(({ zone, offsetX, scale }) => (
            <Group key={zone.id} x={offsetX} scaleX={scale} scaleY={scale}>
              {(tablesByZone.get(zone.id) ?? []).map((table) => (
                <TableToken
                  key={table.id}
                  table={table}
                  zone={zone}
                  status={getTableStatus?.(table.id)}
                  selected={table.id === selectedTableId}
                  onSelect={() => onSelectTable(table.id)}
                  draggable={Boolean(onMoveTable)}
                  onDragEnd={
                    onMoveTable
                      ? (x, y) => {
                          const positionX = clamp((x / zone.width) * 100, 2, 98);
                          const positionY = clamp((y / zone.height) * 100, 2, 98);
                          onMoveTable(table.id, positionX, positionY);
                        }
                      : undefined
                  }
                />
              ))}
            </Group>
          ))}
        </Layer>
      </Stage>

      <div className="absolute bottom-3 right-3 flex gap-1.5">
        <CanvasButton label="−" onClick={() => zoomBy(1 / 1.25)} title="Alejar" />
        <CanvasButton label="Ajustar" onClick={fitToScreen} title="Ajustar a pantalla" wide />
        <CanvasButton label="+" onClick={() => zoomBy(1.25)} title="Acercar" />
        <CanvasButton label="⛶" onClick={toggleFullscreen} title="Pantalla completa" />
      </div>
    </div>
  );
}

function CanvasButton({
  label,
  onClick,
  title,
  wide,
}: {
  label: string;
  onClick: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-8 ${wide ? "px-3" : "w-8"} rounded-lg bg-surface border border-line text-sm text-ink-muted hover:text-ink hover:border-accent transition-colors`}
    >
      {label}
    </button>
  );
}

/** Faint plank seams over the floor gradient — reads as hardwood, not a void. */
function WoodFloor({ width, height }: { width: number; height: number }) {
  const plankHeight = 34;
  const planks = Math.ceil(height / plankHeight);
  return (
    <Group clipFunc={(ctx) => ctx.rect(0, 0, width, height)} listening={false}>
      {Array.from({ length: planks }, (_, i) => (
        <Rect
          key={i}
          x={0}
          y={i * plankHeight}
          width={width}
          height={plankHeight}
          fill={i % 2 === 0 ? "#ffffff" : "#000000"}
          opacity={0.02}
        />
      ))}
      {Array.from({ length: planks }, (_, i) => (
        <Rect key={`seam-${i}`} x={0} y={i * plankHeight} width={width} height={1} fill="#000000" opacity={0.12} />
      ))}
    </Group>
  );
}

/** Purely decorative — makes an empty corner read as "a room", not a coordinate grid. */
function PottedPlant({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <Group x={x} y={y}>
      <Circle radius={scale * 0.55} y={scale * 0.35} fill="#2c2419" />
      <Circle radius={scale * 0.75} fill="#3d5c3f" opacity={0.9} />
      <Circle radius={scale * 0.55} x={-scale * 0.3} y={-scale * 0.25} fill="#4a7550" opacity={0.85} />
      <Circle radius={scale * 0.5} x={scale * 0.35} y={-scale * 0.15} fill="#436b48" opacity={0.85} />
    </Group>
  );
}

function ZoneLabel({ text, x, y }: { text: string; x: number; y: number }) {
  const paddingX = 14;
  const width = text.length * 8 + paddingX * 2;
  return (
    <Group x={x - width / 2} y={y}>
      <Rect width={width} height={26} cornerRadius={13} fill="#1c1916" stroke="#39332b" strokeWidth={1} />
      <Text
        text={text.toUpperCase()}
        width={width}
        height={26}
        align="center"
        verticalAlign="middle"
        fontSize={11}
        fontStyle="600"
        letterSpacing={1}
        fill="#de9a4c"
      />
    </Group>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
