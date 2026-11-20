import Link from "next/link";
import { examPrepDueReviewHref, examPrepRestudyHref } from "@/lib/learning/exam-prep-hrefs";
import { FREE_RESTUDY_PATH_LABEL } from "@/lib/learning/free-restudy";
import { FREE_RESTUDY_BAND } from "@/lib/credits/price-table";
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

/**
 * Faz 4 "Yolu Yeniden Çalış (Ücretsiz)": bitmiş adımlar kayıtlarından, kredisiz ve model çağrısız açılır; test ve
 * doğru/yanlışta soru ve şık sırası her turda karışır. Yolun sırası ve kilitleri değişmez.
 */
export function PrepRestudyCard({ prepId, doneCount }: { prepId: string; doneCount: number }) {
  if (!(doneCount > 0)) return null;
  return (
    <section className="cp-prep-due cp-prep-restudy" aria-label={FREE_RESTUDY_PATH_LABEL}>
      <div className="cp-prep-badges">
        <span className="cp-prep-badge">%100 ücretsiz tekrar</span>
      </div>
      <h2 className="cp-prep-due-title">{doneCount} bitmiş adımı yeniden çöz</h2>
      <p className="cp-prep-due-note">{FREE_RESTUDY_BAND}</p>
      <div className="cp-prep-restudy-actions">
        <Link href={examPrepRestudyHref(prepId, "path")} className="cp-prep-due-go">
          {FREE_RESTUDY_PATH_LABEL}
        </Link>
        <Link href={examPrepRestudyHref(prepId, "mixed")} className="cp-prep-due-go cp-prep-due-go--quiet">
          Karışık Sırayla Çöz (Ücretsiz)
        </Link>
      </div>
    </section>
  );
}
