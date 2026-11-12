import Link from "next/link";
import { ArrowRight, Check, ChevronDown, FileText, X } from "lucide-react";
import { ADVANTAGE_ROWS, SAME_NOTE_CASE } from "@/lib/marketing/advantage-content";
import { HOME_COPY } from "@/lib/marketing/landing-content";

/**
 * Ana sayfanın karşılaştırma sahnesi (11 Kasım 2026).
 *
 * Kokpit turunda (aynı gece) iki şey değişti:
 * - Başındaki kör deney kartı kalktı. Gerçek öğrenci "yapay zekâyla canlandırılan öğrenci" sözünü "kendi kendilerine
 *   100 vermişler" diye okuyordu. Yerinde somut bir örnek var: aynı ders notu iki ayrı yere verilince ne olur
 *   (`SameNoteCase`). Kör deney kartı Özellikler sayfasında, dipnotuyla duruyor.
 * - Satır sayısı indi. "Aynı not" kartının zaten anlattığı iki fark (şekil okuma, şık sayısı) altta ikinci kez
 *   yazılmaz; tam tablo Özellikler sayfasında (`#farklar`).
 * - Fark satırları açılır (`<details>`): kapalıyken başlık ve iki hüküm ("Cortex Plus: Var", "Genel botlar: Yok")
 *   görünür, dokununca iki cevap yan yana açılır. İlk satır açık gelir. Sayfa kısalır, metin sayfada kalır.
 *
 * Metnin tamamı `advantage-content.ts`ten: Cortex tarafındaki her satırın kodda kanıtı var, rakip adı geçmez (bekçi
 * `advantage-content.test.ts`). Solda logonun şeridi bir omurga gibi iner, satırların simgeleri onun üstünde durur;
 * açılan satırda Cortex Plus'ın cevabı ışıkta, genel botlarınki sönük. Sunucu bileşeni: istek ve hareket kodu yok.
 */

/** Ana sayfadaki düello satırları, sırayla. Kalan iki satırı "aynı not" kartı anlatır. */
export const HOME_DUEL_ROW_IDS = ["ikiz-sinav", "sinav-sabahi", "ikiz-soru", "sessiz-sozlu", "velime-link"] as const;

/** "🎯 Başlık" → simge ve başlık. Simge süs; başlık ekran okuyucuya emojisiz okunur. */
function splitFeature(feature: string): { emoji: string; title: string } {
  const at = feature.indexOf(" ");
  return at < 0 ? { emoji: "", title: feature } : { emoji: feature.slice(0, at), title: feature.slice(at + 1) };
}

/** Aynı ders notu, iki ayrı sonuç: solda genel bot, sağda Cortex Plus. */
export function SameNoteCase() {
  const copy = HOME_COPY.duel;
  const data = SAME_NOTE_CASE;
  return (
    <article className="hm-case" aria-labelledby="hm-case-title" data-cinematic-reveal data-testid="same-note-case">
      <div className="hm-case-note">
        <p id="hm-case-title" className="hm-case-file">
          <FileText className="hm-case-file-icon" aria-hidden />
          <span>
            <strong>{data.input.label}</strong>
            <span className="hm-case-file-name">{data.input.file}</span>
          </span>
        </p>
        <ul className="hm-case-lines">
          {data.input.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="hm-case-split">
        <section className="hm-case-side hm-case-side--them" aria-label={copy.them}>
          <h3 className="hm-case-head">
            <X className="hm-duel-icon" strokeWidth={3} aria-hidden />
            {copy.them}
          </h3>
          <ul className="hm-case-points">
            {data.others.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
        <section className="hm-case-side hm-case-side--us" aria-label={copy.us}>
          <h3 className="hm-case-head">
            <Check className="hm-duel-icon" strokeWidth={3} aria-hidden />
            {copy.us}
            <span className="hm-case-badge">{data.cortex.badge}</span>
          </h3>
          <ul className="hm-case-points">
            {data.cortex.points.map((point) => (
              <li key={point.text}>{point.text}</li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

export function LandingDuel() {
  const copy = HOME_COPY.duel;
  const rows = HOME_DUEL_ROW_IDS.map((id) => ADVANTAGE_ROWS.find((row) => row.id === id)).filter((row) => row !== undefined);
  return (
    <section id="farklar" className="hm-section hm-duel" aria-labelledby="hm-duel-title" data-testid="advantage-comparison">
      <div className="lp-wrap">
        <div className="hm-head" data-cinematic-reveal>
          <h2 id="hm-duel-title" className="hm-h2">
            {copy.title}
          </h2>
          <p className="hm-sub">{copy.lead}</p>
        </div>

        <SameNoteCase />

        <ol className="hm-duel-list">
          {rows.map((row, at) => {
            const { emoji, title } = splitFeature(row.feature);
            return (
              <li key={row.id} className="hm-duel-row" data-cinematic-reveal>
                <span className="hm-duel-node" aria-hidden>
                  {emoji}
                </span>
                <details className="hm-duel-item" open={at === 0}>
                  <summary className="hm-duel-summary">
                    <h3 className="hm-duel-title">{title}</h3>
                    <span className="hm-duel-verdicts">
                      <span className="hm-duel-tag hm-duel-tag--us">
                        <Check className="hm-duel-icon" strokeWidth={3} aria-hidden />
                        {copy.us}: {row.cortex.verdict}
                      </span>
                      <span className="hm-duel-tag hm-duel-tag--them">
                        <X className="hm-duel-icon" strokeWidth={3} aria-hidden />
                        {copy.them}: {row.others.verdict}
                      </span>
                    </span>
                    <ChevronDown className="hm-duel-chevron" aria-hidden />
                  </summary>
                  <div className="hm-duel-pair">
                    <p className="hm-duel-body hm-duel-us">{row.cortex.body}</p>
                    <p className="hm-duel-body hm-duel-them">{row.others.body}</p>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>

        <p className="hm-duel-more">
          <Link href="/ozellikler#farklar">
            {copy.more}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  );
}
