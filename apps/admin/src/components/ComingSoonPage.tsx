export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-line bg-surface min-h-[80vh] grid place-items-center">
        <div className="text-center max-w-sm px-4">
          <h1 className="text-lg font-semibold mb-2">{title}</h1>
          <p className="text-ink-muted text-sm">{description}</p>
        </div>
      </div>
    </div>
  );
}
