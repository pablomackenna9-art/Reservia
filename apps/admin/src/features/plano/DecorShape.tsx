import type { ReactNode } from "react";
import { Arc, Circle, Ellipse, Group, Line, Rect } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { ZoneDecor, Zone } from "@reservia/core";
import type { TablePalette } from "./TableToken";

interface DecorShapeProps {
  decor: ZoneDecor;
  zone: Zone;
  palette: TablePalette;
  selected: boolean;
  /** Solo en "Editar plano": se puede tocar, arrastrar y seleccionar. Fuera de eso es puro dibujo. */
  editable: boolean;
  onSelect: () => void;
  /** Nueva posición en unidades locales de la zona (no %): el llamador convierte una sola vez. */
  onDragEnd: (x: number, y: number) => void;
}

/** Plantas, árboles, columnas, barra... dibujados con formas simples, centrados en (0,0) dentro de un ancho x alto. */
function drawDecor(kind: ZoneDecor["kind"], w: number, h: number, c: TablePalette): ReactNode {
  const s = Math.min(w, h);

  switch (kind) {
    case "plant":
      return (
        <>
          <Circle radius={s * 0.48} fill={c.shadow} opacity={0.22} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * 45 * Math.PI) / 180;
            return (
              <Ellipse
                key={i}
                x={Math.cos(a) * s * 0.2}
                y={Math.sin(a) * s * 0.2}
                radiusX={s * 0.3}
                radiusY={s * 0.11}
                rotation={i * 45}
                fill={i % 2 === 0 ? c.leaf : c.leafDark}
              />
            );
          })}
          <Circle radius={s * 0.14} fill={c.pot} />
          <Circle radius={s * 0.07} fill={c.leafDark} opacity={0.55} />
        </>
      );

    case "tree":
      return (
        <>
          <Circle radius={s * 0.5} fill={c.shadow} opacity={0.2} />
          <Circle radius={s * 0.42} fill={c.leafDark} />
          <Circle x={-s * 0.2} y={-s * 0.12} radius={s * 0.27} fill={c.leaf} />
          <Circle x={s * 0.19} y={-s * 0.14} radius={s * 0.25} fill={c.leaf} />
          <Circle x={s * 0.04} y={s * 0.2} radius={s * 0.27} fill={c.leaf} />
          <Circle x={-s * 0.16} y={s * 0.16} radius={s * 0.17} fill={c.leafDark} opacity={0.85} />
          <Circle x={s * 0.02} y={-s * 0.22} radius={s * 0.15} fill={c.leafDark} opacity={0.85} />
          <Circle radius={s * 0.055} fill={c.pot} />
        </>
      );

    case "planter": {
      const count = Math.max(2, Math.floor(w / 24));
      const step = w / count;
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={7} fill={c.pot} />
          <Rect x={-w / 2 + 3} y={-h / 2 + 3} width={w - 6} height={h - 6} cornerRadius={5} fill={c.leafDark} />
          {Array.from({ length: count }, (_, i) => (
            <Circle
              key={i}
              x={-w / 2 + step * (i + 0.5)}
              y={(i % 2 === 0 ? 1 : -1) * h * 0.06}
              radius={h * 0.34}
              fill={i % 2 === 0 ? c.leaf : c.leafDark}
              stroke={c.leafDark}
              strokeWidth={1}
            />
          ))}
        </>
      );
    }

    case "column":
      return (
        <>
          <Circle radius={s / 2} fill={c.stone} stroke={c.seatLine} strokeWidth={1.5} />
          <Circle radius={Math.max(2, s / 2 - 4)} stroke={c.seatLine} strokeWidth={0.8} opacity={0.6} />
        </>
      );

    case "wall":
      return <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={3} fill={c.stone} stroke={c.seatLine} strokeWidth={1} />;

    case "door":
      // Marco en la base, hoja abierta a la izquierda y el arco por donde gira.
      return (
        <>
          <Line points={[-w / 2, h / 2, w / 2, h / 2]} stroke={c.seatLine} strokeWidth={4} lineCap="round" />
          <Line points={[-w / 2, h / 2, -w / 2, h / 2 - w]} stroke={c.wood} strokeWidth={3} lineCap="round" />
          <Arc x={-w / 2} y={h / 2} innerRadius={w - 0.6} outerRadius={w + 0.6} angle={90} rotation={-90} fill={c.seatLine} opacity={0.65} />
        </>
      );

    case "bar": {
      const stools = Math.max(2, Math.floor(w / 38));
      const step = w / stools;
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={9} fill={c.stone} stroke={c.seatLine} strokeWidth={1.5} shadowColor={c.shadow} shadowBlur={8} shadowOffsetY={3} shadowOpacity={0.5} shadowForStrokeEnabled={false} />
          <Rect x={-w / 2 + 5} y={-h / 2 + 5} width={w - 10} height={h - 10} cornerRadius={6} fill={c.wood} opacity={0.55} />
          {Array.from({ length: stools }, (_, i) => (
            <Group key={i} x={-w / 2 + step * (i + 0.5)} y={h / 2 + 14}>
              <Circle radius={9} fill={c.seat} stroke={c.seatLine} strokeWidth={1.2} />
              <Circle radius={4} stroke={c.seatLine} strokeWidth={0.8} opacity={0.6} />
            </Group>
          ))}
        </>
      );
    }

    case "sofa": {
      const cushions = Math.max(2, Math.round(w / 40));
      const backH = h * 0.34;
      return (
        <>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={9} fill={c.seat} stroke={c.seatLine} strokeWidth={1.5} shadowColor={c.shadow} shadowBlur={7} shadowOffsetY={2} shadowOpacity={0.45} shadowForStrokeEnabled={false} />
          <Rect x={-w / 2} y={-h / 2} width={w} height={backH} cornerRadius={[9, 9, 2, 2]} fill={c.seatLine} opacity={0.55} />
          {Array.from({ length: cushions - 1 }, (_, i) => {
            const x = -w / 2 + (w / cushions) * (i + 1);
            return <Line key={i} points={[x, -h / 2 + backH, x, h / 2 - 3]} stroke={c.seatLine} strokeWidth={1} opacity={0.7} />;
          })}
        </>
      );
    }
  }
}

export function DecorShape({ decor, zone, palette, selected, editable, onSelect, onDragEnd }: DecorShapeProps) {
  const x = (decor.positionX / 100) * zone.width;
  const y = (decor.positionY / 100) * zone.height;
  const pad = 7;

  return (
    <Group
      x={x}
      y={y}
      rotation={decor.rotation}
      draggable={editable}
      listening={editable}
      onClick={editable ? onSelect : undefined}
      onTap={editable ? onSelect : undefined}
      onDragStart={editable ? onSelect : undefined}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => onDragEnd(e.target.x(), e.target.y())}
    >
      {/* Zona de toque: transparente pero clicable, para agarrar objetos finos (muros, plantas) sin puntería fina. */}
      <Rect x={-decor.width / 2 - 4} y={-decor.height / 2 - 4} width={decor.width + 8} height={decor.height + 8} fill="transparent" />
      {drawDecor(decor.kind, decor.width, decor.height, palette)}
      {selected && editable && (
        <Rect
          x={-decor.width / 2 - pad}
          y={-decor.height / 2 - pad}
          width={decor.width + pad * 2}
          height={decor.height + pad * 2}
          cornerRadius={10}
          stroke={palette.acc}
          strokeWidth={2}
          dash={[6, 4]}
          listening={false}
        />
      )}
    </Group>
  );
}
