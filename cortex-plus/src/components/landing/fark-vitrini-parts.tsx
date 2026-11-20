import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { FARK_VITRINI, SHOWCASE_COMPARE_LABELS, splitShowcaseTitle, type ShowcaseCompare } from "@/lib/marketing/fark-vitrini";

/*
  Fark vitrini kartlarının ortak parçaları (20 Kasım 2026). Durum ve istek yok: sunucu kartı (sınıfla paylaş) ve
  istemci kartları (radyo, kırmızı kalem) aynı başlığı ve aynı karşılaştırma bloğunu kullanır.
*/

/** Kart başlığı: simge süs (ekran okuyucu simgesiz okur); altında rozetler. */
export function ShowcaseHead({ id, title, plus = false, children }: { id: string; title: string; plus?: boolean; children?: ReactNode }) {
  const { emoji, text } = splitShowcaseTitle(title);
  return (
    // `<div>`, `<header>` değil: pazarlama kabuğunun `.cs-marketing header` kuralı her başlık öğesini boyuyor.
    <div className="fv-head">
      <h3 id={id} className="fv-title">
        {emoji ? (
          <span className="fv-title-emoji" aria-hidden>
            {emoji}
          </span>
        ) : null}{" "}
        {text}
      </h3>
      {children || plus ? (
        <div className="fv-chips">
          {children}
          {plus ? <span className="fv-plus">{FARK_VITRINI.plus}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** İki satırlık karşılaştırma: Cortex Plus ışıkta, genel botlar sönük ve kesik çizgili (düello satırlarıyla aynı dil). */
export function ShowcaseCompareBlock({ compare }: { compare: ShowcaseCompare }) {
  return (
    <dl className="fv-compare">
      <div className="fv-compare-row fv-compare-row--us">
        <dt>
          <Check className="fv-compare-icon" strokeWidth={3} aria-hidden />
          {SHOWCASE_COMPARE_LABELS.us}
        </dt>
        <dd>{compare.cortex}</dd>
      </div>
      <div className="fv-compare-row fv-compare-row--them">
        <dt>
          <X className="fv-compare-icon" strokeWidth={3} aria-hidden />
          {SHOWCASE_COMPARE_LABELS.them}
        </dt>
        <dd>{compare.others}</dd>
      </div>
    </dl>
  );
}
