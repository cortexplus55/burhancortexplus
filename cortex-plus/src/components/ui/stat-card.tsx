import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-xl)] border border-[var(--c-border)] bg-surface-1 p-4",
        className
      )}
    >
      <p className="text-12 font-semibold uppercase tracking-[0.08em] text-[var(--c-text-muted)]">
        {label}
      </p>
      <p className="mt-1 font-display text-28 text-[var(--c-text)] tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-14 text-[var(--c-text-muted)]">{hint}</p> : null}
    </div>
  );
}

function SourceChip({
  fileName,
  page,
  className,
}: {
  fileName: string;
  page?: number | null;
  className?: string;
}) {
  const pagePart = page != null && page > 0 ? ` · s.${page}` : "";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-[var(--r-sm)] bg-surface-2 px-2 py-1 text-12 text-[var(--c-text-muted)]",
        className
      )}
    >
      <FileText className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {fileName}
        {pagePart}
      </span>
    </span>
  );
}

export { StatCard, SourceChip };
