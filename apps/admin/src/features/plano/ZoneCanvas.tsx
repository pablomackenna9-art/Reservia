import { useEffect, useRef } from "react";
import { Stage, Layer, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table, Zone } from "@reservia/core";
import { useContainerSize } from "../../hooks/useContainerSize";
import { TableToken } from "./TableToken";

const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
const ZONE_MARGIN = 0.92; // leaves breathing room around the zone at fit-to-screen

interface ZoneCanvasProps {
  zone: Zone;
  tables: Table[];
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
}

export function ZoneCanvas({ zone, tables, selectedTableId, onSelectTable }: ZoneCanvasProps) {
  const { ref: containerRef, width, height } = useContainerSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage | null>(null);

  const fitToScreen = () => {
    const stage = stageRef.current;
    if (!stage || width === 0 || height === 0) return;
    const scale = Math.min(width / zone.width, height / zone.height) * ZONE_MARGIN;
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (width - zone.width * scale) / 2,
      y: (height - zone.height * scale) / 2,
    });
    stage.batchDraw();
  };

  // Re-fit whenever the panel is resized or the active zone changes.
  useEffect(fitToScreen, [width, height, zone.id, zone.width, zone.height]);

  function handleWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = stage.scaleX();
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = clamp(oldScale * (1 + direction * 0.08), MIN_SCALE, MAX_SCALE);

    const pointerZonePos = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - pointerZonePos.x * newScale,
      y: pointer.y - pointerZonePos.y * newScale,
    });
    stage.batchDraw();
  }

  function zoomBy(factor: number) {
    const stage = stageRef.current;
    if (!stage || width === 0 || height === 0) return;
    const oldScale = stage.scaleX();
    const newScale = clamp(oldScale * factor, MIN_SCALE, MAX_SCALE);
    const center = { x: width / 2, y: height / 2 };
    const centerZonePos = { x: (center.x - stage.x()) / oldScale, y: (center.y - stage.y()) / oldScale };

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: center.x - centerZonePos.x * newScale,
      y: center.y - centerZonePos.y * newScale,
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
        draggable
        onWheel={handleWheel}
        onClick={(e) => {
          if (e.target === e.target.getStage()) onSelectTable(null);
        }}
      >
        <Layer listening={false}>
          <Rect x={0} y={0} width={zone.width} height={zone.height} cornerRadius={16} fill="#141210" />
          <Text text={zone.name.toUpperCase()} x={16} y={14} fontSize={13} fill="#8a7f6d" letterSpacing={1} />
        </Layer>
        <Layer>
          {tables.map((table) => (
            <TableToken
              key={table.id}
              table={table}
              selected={table.id === selectedTableId}
              onSelect={() => onSelectTable(table.id)}
            />
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
