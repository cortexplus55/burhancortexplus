import Link from "next/link";
import type { CurriculumProgram } from "@/lib/curriculum/types";

/**
 * Eski konu ağacı sayfasında güncel (derin) programa bağlantı (27 Kasım 2026). Sayfa açık kalır; öğrenci ve arama
 * motoru güncel hâline buradan geçer.
 */
export function SupersededNotice({ current }: { current: Pick<CurriculumProgram, "id" | "label"> }) {
  return (
    <p className="mk-card mt-4 p-3 text-sm text-[var(--mk-muted)]" data-testid="superseded-notice">
      Bu konu ağacının daha ayrıntılı, güncel hâli var:{" "}
      <Link href={`/mufredat/${current.id}`} className="font-semibold text-[var(--mk-text)] underline underline-offset-2">
        {current.label}
      </Link>
      . Bu sayfa, ona bağlı eski hazırlıklar için açık kalıyor.
    </p>
  );
}
