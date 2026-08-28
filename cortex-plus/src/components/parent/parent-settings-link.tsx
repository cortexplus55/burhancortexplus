import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function ParentSettingsLink({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="astra-pay-card flex items-center gap-3 p-4"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--astra-muted)]">
          {body}
        </span>
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-[var(--astra-muted)]"
        aria-hidden
      />
    </Link>
  );
}
