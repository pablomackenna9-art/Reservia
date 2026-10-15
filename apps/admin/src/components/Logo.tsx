/** Una mesa vista desde arriba con un cuarto ya tomado, más "Reservia" en serif itálica. */
export function Logo({ size = 28 }: { size?: number }) {
  const circle = Math.round(size * 0.93);
  const quarter = Math.round(circle * 0.31);
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="rounded-full box-border flex items-start justify-end border-accent"
        style={{ width: circle, height: circle, borderWidth: 2.5, padding: 3 }}
        aria-hidden
      >
        <div className="bg-accent" style={{ width: quarter, height: quarter, borderRadius: `0 ${quarter}px 0 0` }} />
      </div>
      <span className="font-serif italic leading-none" style={{ fontSize: size }}>
        Reservia
      </span>
    </div>
  );
}
