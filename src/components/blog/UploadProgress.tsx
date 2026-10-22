export default function UploadProgress({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2 rounded-control border border-border bg-muted/30 p-3" role="status">
      <div className="flex items-center justify-between gap-3 text-label">
        <span className="text-ink">{label}</span>
        <span className="shrink-0 tabular-nums text-ink-subtle">{value}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full w-full rounded-full bg-primary transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(${value - 100}%)` }}
        />
      </div>
    </div>
  );
}
