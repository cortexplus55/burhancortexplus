import { Check, X } from "lucide-react";
import { ADVANTAGE_ROWS, BLIND_EXPERIMENT_PROOF, SHOW_BLIND_EXPERIMENT_PROOF } from "@/lib/marketing/advantage-content";
import { HOME_COPY } from "@/lib/marketing/landing-content";

/**
 * Ana sayfanın karşılaştırma sahnesi (11 Kasım 2026, ikinci tur; ürün sahibi: "karşılaştırmalarımız da olsun").
 *
 * Metnin tamamı `advantage-content.ts`ten: her satırın kodda kanıtı var, rakip adı geçmez (bekçi
 * `advantage-content.test.ts`). Burada yalnız sunum değişir: tablo yerine "düello". Ortada logonun şeridi bir omurga
 * gibi iner; solunda genel botların sönük cevabı, sağında Cortex Plus'ın ışıklı cevabı. Telefonda her satır tek
 * sütuna iner, şerit solda kalır. Sunucu bileşeni: istek ve hareket kodu yok.
 */

/** "🎯 Başlık" → simge ve başlık. Simge süs; başlık ekran okuyucuya emojisiz okunur. */
function splitFeature(feature: string): { emoji: string; title: string } {
  const at = feature.indexOf(" ");
  return at < 0 ? { emoji: "", title: feature } : { emoji: feature.slice(0, at), title: feature.slice(at + 1) };
}

export function LandingProof() {
  if (!SHOW_BLIND_EXPERIMENT_PROOF) return null;
  const proof = BLIND_EXPERIMENT_PROOF;
  return (
    <article className="hm-proof" aria-labelledby="hm-proof-title" data-cinematic-reveal data-testid="blind-proof">
      <p
        className="hm-proof-score"
        role="img"
        aria-label={`${proof.before.label} ${proof.before.value}, ${proof.after.label} ${proof.after.value}`}
      >
        <span className="hm-proof-from" aria-hidden>
          {proof.before.value}
        </span>
        <span className="hm-proof-arrow" aria-hidden />
        <span className="hm-proof-to" aria-hidden>
          {proof.after.value}
        </span>
      </p>
      <div className="hm-proof-copy">
        <h3 id="hm-proof-title" className="hm-proof-title">
          {proof.kicker}
        </h3>
        <p className="hm-proof-body">{proof.body}</p>
        <p className="hm-proof-foot">{proof.footnote}</p>
      </div>
    </article>
  );
}

export function LandingDuel() {
  const copy = HOME_COPY.duel;
  return (
    <section id="farklar" className="hm-section hm-duel" aria-labelledby="hm-duel-title" data-testid="advantage-comparison">
      <div className="lp-wrap">
        <div className="hm-head" data-cinematic-reveal>
          <h2 id="hm-duel-title" className="hm-h2">
            {copy.title}
          </h2>
          <p className="hm-sub">{copy.lead}</p>
        </div>

        <LandingProof />

        <ol className="hm-duel-list">
          {ADVANTAGE_ROWS.map((row) => {
            const { emoji, title } = splitFeature(row.feature);
            return (
              <li key={row.id} className="hm-duel-row" data-cinematic-reveal>
                <span className="hm-duel-node" aria-hidden>
                  {emoji}
                </span>
                <div className="hm-duel-us">
                  <p className="hm-duel-tag hm-duel-tag--us">
                    <Check className="hm-duel-icon" strokeWidth={3} aria-hidden />
                    {copy.us}: {row.cortex.verdict}
                  </p>
                  <h3 className="hm-duel-title">{title}</h3>
                  <p className="hm-duel-body">{row.cortex.body}</p>
                </div>
                <div className="hm-duel-them">
                  <p className="hm-duel-tag hm-duel-tag--them">
                    <X className="hm-duel-icon" strokeWidth={3} aria-hidden />
                    {copy.them}: {row.others.verdict}
                  </p>
                  <p className="hm-duel-body">{row.others.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
