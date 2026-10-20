import Link from "next/link";
import { examPrepDueReviewHref } from "@/lib/learning/exam-prep-hrefs";
import "@/styles/prep-review.css";

/**
 * Hazırlık sayfasında "Bugün N tekrar" (20 Ekim 2026, ürün sahibinin kararı). Yalnız bu hazırlığın
 * tekrarı; "Devam et", "Sıradaki", yol sırası ve kilitler değişmez — kart yolun yanında durur.
 */
export function PrepDueReviewCard({ prepId, count }: { prepId: string; count: number }) {
  if (!(count > 0)) return null;
  return (
    <section className="cp-prep-due" aria-label="Bugünkü tekrar">
      <div className="cp-prep-badges">
        <span className="cp-prep-badge">Aralıklı tekrar</span>
      </div>
      <h2 className="cp-prep-due-title">Bugün {count} tekrar</h2>
      <p className="cp-prep-due-note">Önceki günlerde zorlandığın sorular ve dersin sınav noktaları. Yolunu kilitlemez.</p>
      <Link href={examPrepDueReviewHref(prepId)} className="cp-prep-due-go">
        Tekrara başla
      </Link>
    </section>
  );
}
