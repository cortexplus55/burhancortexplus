import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PlusChildOption } from "@/lib/parent/plus-children";
import { parentPlusHref } from "@/lib/parent/plus-href";

export function ParentPlusChildPicker({
  options,
  selectedId,
}: {
  options: PlusChildOption[];
  selectedId: string;
}) {
  if (!options.length) return null;

  return (
    <section className="mt-5">
      <h2 className="text-sm font-medium text-[var(--astra-muted)]">
        Kota kime gidecek
      </h2>
      <div
        aria-label="Çocuk seç"
        className="mt-2 flex gap-2 overflow-x-auto pb-1"
      >
        {options.map((child) => {
          const selected = child.studentId === selectedId;
          return (
            <Link
              key={child.studentId}
              href={parentPlusHref(child.studentId)}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex min-w-[9.5rem] shrink-0 items-center gap-2 rounded-2xl border px-3 py-2.5 text-left",
                selected
                  ? "border-amber-400/70 bg-amber-500/15"
                  : "border-[var(--astra-border)] bg-[var(--astra-surface)]",
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-800/90 text-sm">
                {child.avatar}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {child.name}
                </span>
                <span
                  className={cn(
                    "text-[11px]",
                    child.hasPlus
                      ? "text-amber-200"
                      : "text-[var(--astra-muted)]",
                  )}
                >
                  {child.planBadge ?? "Ücretsiz"}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
