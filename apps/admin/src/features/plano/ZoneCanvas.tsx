import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Stage, Layer, Rect, Text, Group } from "react-konva";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table, TableLiveStatusValue, Zone } from "@reservia/core";
import { useContainerSize } from "../../hooks/useContainerSize";
import { dotGridTile, konvaLook, tableVisualState, type KonvaLook, type VisualState } from "../../lib/stateStyle";
import { themeColor, useTheme } from "../../lib/theme";
import { TableToken, type TableHighlightState, type TableInfoLine, type TablePalette } from "./TableToken";

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

/** Lo mínimo para sentarla -- viaja entero en el dataTransfer del drag, así el drop no necesita ir a buscar nada más. */
export interface WaitlistDragPayload {
  waitlistEntryId: string;
  customerId: string;
  partySize: number;
  customerName: string;
}

export const WAITLIST_DRAG_MIME = "application/x-reservia-waitlist-entry";

interface ZoneCanvasProps {
  /** One zone (a single tab) or several (the unified "Todo" floor) — same component either way. */
  zones: Zone[];
  tables: Table[];
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
  onMoveTable?: (tableId: string, positionX: number, positionY: number) => void;
  getTableStatus?: (tableId: string) => TableLiveStatusValue;
  /** Smart Table Engine floor-plan picker only — leave undefined for the normal plano. */
  getHighlightState?: (tableId: string) => TableHighlightState | undefined;
  /** Alguien sentado ahí y otra reserva por llegar pronto -- ver findTurnoverConflict. */
  getTurnoverWarning?: (tableId: string) => boolean;
  /** Arrastrar una fila de la lista de espera hasta acá -- undefined en el picker del Smart Table Engine. */
  onDropWaitlistEntry?: (payload: WaitlistDragPayload, tableId: string) => void;
  /** Zona elegida en las pestañas -- las mesas de las demás zonas se atenúan (no se ocultan). null/undefined = todas por igual. */
  activeZoneId?: string | null;
  /** Línea viva bajo cada mesa (tiempo sentados, hora de la reserva, "libre"). */
  getTableInfo?: (tableId: string) => TableInfoLine | undefined;
}

export function ZoneCanvas({
  zones,
  tables,
  selectedTableId,
  onSelectTable,
  onMoveTable,
  getTableStatus,
  getHighlightState,
  getTurnoverWarning,
  onDropWaitlistEntry,
  activeZoneId,
  getTableInfo,
}: ZoneCanvasProps) {
  const theme = useTheme();
  const [dragActive, setDragActive] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  // Ampliado = se puede arrastrar el plano con un dedo; al encuadre completo el dedo scrollea la página.
  const [zoomed, setZoomed] = useState(false);
  const fitScaleRef = useRef(1);
  const pinch = useRef<{ dist: number; center: { x: number; y: number } | null }>({ dist: 0, center: null });

  // Konva dibuja con la fuente que haya en ese instante: si Instrument Serif
  // todavía no cargó, los nombres de mesa salen en la de respaldo y nunca se
  // repintan. Esperamos a las fuentes y forzamos un redibujo.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      document.fonts.load('22px "Instrument Serif"'),
      document.fonts.load('600 13px "Instrument Sans"'),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Colores y patrones del tema ACTUAL -- se recalculan solo al cambiar de tema (no por mesa ni por render).
  const looks = useMemo(() => {
    const map = new Map<VisualState, KonvaLook>();
    for (const state of ["free", "reserved", "arriving", "occupied", "paying", "blocked"] as const) {
      map.set(state, konvaLook(state));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  const palette = useMemo<TablePalette>(
    () => ({
      ink: themeColor("ink"),
      ink2: themeColor("ink2"),
      acc: themeColor("acc"),
      occ: themeColor("s-occ"),
      free: themeColor("s-free"),
      arr: themeColor("s-arr"),
      onS: themeColor("on-s"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );
  const dotTile = useMemo(() => dotGridTile(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoneStroke = themeColor("ink3", 0.7);
  const labelBg = themeColor("sf2");
  const { ref: containerRef, width, height } = useContainerSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.style.touchAction = zoomed ? "none" : "pan-y";
  }, [zoomed, containerRef]);

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

  // En desarrollo (StrictMode) react-konva recrea el Stage y la ref puede quedar apuntando al viejo ya destruido:
  // siempre buscamos el Stage vivo que está dentro de ESTE contenedor.
  function getStage(): Konva.Stage | null {
    const container = containerRef.current;
    const live = container ? Konva.stages.find((st) => container.contains(st.container())) : undefined;
    return live ?? stageRef.current;
  }

  // Konva's own drawing can fail transiently on a canvas that's mid-resize
  // (a browser-level "drawImage on a 0x0 canvas" error, not an app bug) —
  // never let that crash the whole page, just skip that redraw.
  function safeBatchDraw(stage: Konva.Stage) {
    try {
      stage.batchDraw();
    } catch (err) {
      console.warn("Konva batchDraw skipped:", err);
    }
  }

  // Con una zona elegida, el encuadre se ajusta a ESA zona (las demás quedan
  // atenuadas, fuera de vista pero a un gesto de distancia); sin zona, a todo el piso.
  const focus = useMemo(() => {
    const target = activeZoneId ? layout.find((l) => l.zone.id === activeZoneId) : undefined;
    if (!target) return { x: 0, y: 0, w: floorWidth, h: floorHeight };
    return { x: target.offsetX, y: 0, w: target.zone.width * target.scale, h: COMMON_HEIGHT };
  }, [activeZoneId, layout, floorWidth, floorHeight]);

  const fitToScreen = () => {
    const stage = getStage();
    if (!stage || width <= 0 || height <= 0 || focus.w <= 0 || focus.h <= 0) return;
    const scale = Math.min(width / focus.w, height / focus.h) * FLOOR_MARGIN;
    fitScaleRef.current = scale;
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (width - focus.w * scale) / 2 - focus.x * scale,
      y: (height - focus.h * scale) / 2 - focus.y * scale,
    });
    setZoomed(false);
    safeBatchDraw(stage);
  };

  // Re-fit whenever the panel is resized or the framing changes.
  useEffect(() => {
    fitToScreen();
    // El segundo pase cubre el Stage que react-konva recrea en desarrollo (StrictMode) justo después de este efecto.
    const frame = requestAnimationFrame(fitToScreen);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, focus.x, focus.y, focus.w, focus.h]);

  function syncZoomed(stage: Konva.Stage) {
    setZoomed(stage.scaleX() > fitScaleRef.current * 1.05);
  }

  // Pellizco con dos dedos (zoom + desplazamiento), patrón de la doc de Konva.
  function handleTouchMove(e: KonvaEventObject<TouchEvent>) {
    const stage = getStage();
    const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
    if (!stage || !t1 || !t2) return;
    e.evt.preventDefault();
    if (stage.isDragging()) stage.stopDrag();

    const rect = stage.container().getBoundingClientRect();
    const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
    const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

    if (!pinch.current.center || !pinch.current.dist) {
      pinch.current = { dist, center };
      return;
    }
    const oldScale = stage.scaleX();
    const newScale = clamp(oldScale * (dist / pinch.current.dist), MIN_SCALE, MAX_SCALE);
    const pointTo = { x: (center.x - stage.x()) / oldScale, y: (center.y - stage.y()) / oldScale };
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: center.x - pointTo.x * newScale + (center.x - pinch.current.center.x),
      y: center.y - pointTo.y * newScale + (center.y - pinch.current.center.y),
    });
    pinch.current = { dist, center };
    syncZoomed(stage);
    safeBatchDraw(stage);
  }

  function handleTouchEnd() {
    pinch.current = { dist: 0, center: null };
  }

  function handleWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = getStage();
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
    syncZoomed(stage);
    safeBatchDraw(stage);
  }

  function zoomBy(factor: number) {
    const stage = getStage();
    if (!stage || width <= 0 || height <= 0) return;
    const oldScale = stage.scaleX();
    const newScale = clamp(oldScale * factor, MIN_SCALE, MAX_SCALE);
    const center = { x: width / 2, y: height / 2 };
    const centerFloorPos = { x: (center.x - stage.x()) / oldScale, y: (center.y - stage.y()) / oldScale };

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: center.x - centerFloorPos.x * newScale,
      y: center.y - centerFloorPos.y * newScale,
    });
    syncZoomed(stage);
    safeBatchDraw(stage);
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

  /**
   * A qué mesa corresponde el punto donde soltaron -- invierte el pan/zoom
   * del stage y el offset/escala de la zona (el mismo `layout` que ya
   * posiciona cada `TableToken`) para volver a coordenadas de mesa sin
   * tocar nada de Konva. Bounding box simple, sin considerar rotación --
   * alcanza para un drop, no hace falta precisión de píxel.
   */
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!onDropWaitlistEntry) return;
    const stage = getStage();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!stage || !rect) return;

    const raw = e.dataTransfer.getData(WAITLIST_DRAG_MIME);
    if (!raw) return;
    let payload: WaitlistDragPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const stageX = (e.clientX - rect.left - stage.x()) / stage.scaleX();
    const stageY = (e.clientY - rect.top - stage.y()) / stage.scaleY();

    for (const { zone, offsetX, scale } of layout) {
      const zoneWidthScaled = zone.width * scale;
      const zoneHeightScaled = zone.height * scale;
      if (stageX < offsetX || stageX > offsetX + zoneWidthScaled || stageY < 0 || stageY > zoneHeightScaled) continue;

      const zoneLocalX = (stageX - offsetX) / scale;
      const zoneLocalY = stageY / scale;
      for (const table of tablesByZone.get(zone.id) ?? []) {
        const cx = (table.positionX / 100) * zone.width;
        const cy = (table.positionY / 100) * zone.height;
        const withinX = zoneLocalX >= cx - table.width / 2 && zoneLocalX <= cx + table.width / 2;
        const withinY = zoneLocalY >= cy - table.height / 2 && zoneLocalY <= cy + table.height / 2;
        if (!withinX || !withinY) continue;

        const status = getTableStatus?.(table.id) ?? "available";
        if (status !== "available") {
          alert(`Mesa ${table.name} no está disponible ahora mismo.`);
          return;
        }
        if (payload.partySize > table.capacityMax) {
          alert(`Mesa ${table.name} es para máximo ${table.capacityMax} personas.`);
          return;
        }
        onDropWaitlistEntry(payload, table.id);
        return;
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onDragOver={
        onDropWaitlistEntry
          ? (e) => {
              e.preventDefault();
              if (!dragActive) setDragActive(true);
            }
          : undefined
      }
      onDragLeave={
        onDropWaitlistEntry
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragActive(false);
            }
          : undefined
      }
      onDrop={
        onDropWaitlistEntry
          ? (e) => {
              setDragActive(false);
              handleDrop(e);
            }
          : undefined
      }
    >
      {width > 0 && height > 0 && (
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onWheel={handleWheel}
        draggable={zoomed}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
                fillPatternImage={dotTile as unknown as HTMLImageElement}
                fillPatternRepeat="repeat"
                stroke={zoneStroke}
                strokeWidth={1.5 / scale}
                dash={[8 / scale, 6 / scale]}
                opacity={activeZoneId && activeZoneId !== zone.id ? 0.5 : 1}
              />
              <ZoneLabel text={zone.name} x={zone.width * 0.06} scale={scale} bg={labelBg} color={themeColor("ink3")} />
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
                  look={looks.get(tableVisualState(getTableStatus?.(table.id) ?? "available"))!}
                  palette={palette}
                  info={fontsReady ? getTableInfo?.(table.id) : undefined}
                  dimmed={Boolean(activeZoneId) && activeZoneId !== zone.id}
                  dropReady={dragActive && (getTableStatus?.(table.id) ?? "available") === "available"}
                  selected={table.id === selectedTableId}
                  onSelect={() => onSelectTable(table.id)}
                  highlightState={getHighlightState?.(table.id)}
                  turnoverWarning={getTurnoverWarning?.(table.id)}
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
      )}

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

/** Rótulo de zona en mayúsculas, cortando el borde superior punteado. */
function ZoneLabel({ text, x, scale, bg, color }: { text: string; x: number; scale: number; bg: string; color: string }) {
  const fontSize = 13 / scale;
  const paddingX = 10 / scale;
  const label = text.toUpperCase();
  const width = label.length * fontSize * 0.68 + paddingX * 2;
  return (
    <Group x={x} y={-fontSize * 0.6}>
      <Rect width={width} height={fontSize * 1.3} fill={bg} />
      <Text
        text={label}
        x={paddingX}
        y={fontSize * 0.15}
        fontSize={fontSize}
        fontFamily="Instrument Sans"
        fontStyle="600"
        letterSpacing={fontSize * 0.1}
        fill={color}
      />
    </Group>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
