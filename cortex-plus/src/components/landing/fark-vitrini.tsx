import { ChevronDown } from "lucide-react";
import { ShowcaseCompareBlock, ShowcaseHead } from "@/components/landing/fark-vitrini-parts";
import { RadioShowcaseCard } from "@/components/landing/fark-vitrini-radio";
import { RedPenShowcaseCard } from "@/components/landing/fark-vitrini-red-pen";
import { demoRadioPlaylist } from "@/lib/demo/demo-podcasts";
import { CRAM_KIND_LABEL, CRAM_SHEET_TITLE, CRAM_SIGNATURE } from "@/lib/learning/cram-sheet";
import { CLASS_SHARE_SHOWCASE, FARK_VITRINI, SHARE_SAMPLE_URL } from "@/lib/marketing/fark-vitrini";
import { qrSvgMarkup } from "@/lib/utils/qr-svg";
import "@/styles/fark-vitrini.css";

/**
 * Fark vitrini (20 Kasım 2026, Faz 7): misafirin kayıt olmadan dokunabildiği üç kart.
 *
 *   A — Sınav Radyosu: kayıtlı ünite podcastleri sırayla çalar (istemci kartı, `fark-vitrini-radio.tsx`)
 *   B — Kırmızı Kalemli Hoca: örnek çözüm kâğıdında kazanılan ve kırılan puan (istemci kartı, `fark-vitrini-red-pen.tsx`)
 *   C — Sınıfla paylaş + QR'lı sınav sabahı kâğıdı (bu dosya, sunucu bileşeni)
 *
 * Ana sayfada "Aynı not, iki ayrı sonuç" bölümünün içinde, karşılaştırma kartının hemen altında (`LandingDuel`);
 * /ornek sayfasının sonunda A ve B "Kayıtlı Hesapta Açılan Süper Güçler" şeridinde. Kartlar aynı bileşenler.
 *
 * Sıfır istek: radyo yalnız tıklamada `public/ornek/` altındaki kaydı çalar; QR kodu sunucuda çizilir (`qrSvgMarkup`,
 * ağ yok) ve sayfaya SVG olarak gömülür, `qrcode` paketi istemci paketine girmez. Model, ses üretimi, kredi yok.
 * Metnin tamamı `fark-vitrini.ts`te.
 */

/** Örnek QR, sunucuda bir kez: aynı adres her zaman aynı çizim. */
const SAMPLE_QR = qrSvgMarkup(SHARE_SAMPLE_URL, { size: 96, margin: 2, title: CLASS_SHARE_SHOWCASE.qrTitle });

/** Kart C: mini sınav sabahı kâğıdı (köşesinde QR), +50 kredi rozeti ve paylaşımın üç adımı. */
export function ClassShareShowcaseCard() {
  const data = CLASS_SHARE_SHOWCASE;
  const titleId = `${data.id}-title`;
  return (
    <article className="fv-card fv-card--share" aria-labelledby={titleId} data-testid="showcase-class-share">
      <ShowcaseHead id={titleId} title={data.title}>
        <span className="fv-badge fv-badge--bonus">{data.bonus}</span>
      </ShowcaseHead>

      <div className="fv-stage">
        <div className="fv-sheet">
          <div className="fv-sheet-top">
            <div className="fv-sheet-heading">
              <p className="fv-sheet-title">{CRAM_SHEET_TITLE}</p>
              <p className="fv-sheet-topic">{data.sheetTopic}</p>
            </div>
            <figure className="fv-qr">
              {/* Kendi üreticimizin SVG'si: dış kaynak ya da resim isteği yok. */}
              <span className="fv-qr-code" data-testid="share-qr" dangerouslySetInnerHTML={{ __html: SAMPLE_QR }} />
              <figcaption className="fv-qr-caption">
                <span className="fv-qr-caption-label">{data.qrCaption.label}</span>
                <span className="fv-qr-caption-url">
                  {data.qrCaption.url.split("/").map((part, at, parts) => (
                    <span key={part}>
                      {part}
                      {at < parts.length - 1 ? (
                        <>
                          /<wbr />
                        </>
                      ) : null}
                    </span>
                  ))}
                </span>
              </figcaption>
            </figure>
          </div>
          <ul className="fv-sheet-lines">
            {data.sheetLines.map((line) => (
              <li key={line.text} className="fv-sheet-line" data-kind={line.kind}>
                <span className="fv-sheet-tag">{CRAM_KIND_LABEL[line.kind]}</span>
                <span className="fv-sheet-text">{line.text}</span>
              </li>
            ))}
          </ul>
          <p className="fv-sheet-sign">{CRAM_SIGNATURE}</p>
        </div>

        <details className="fv-steps">
          <summary className="fv-steps-summary">
            {data.stepsSummary}
            <ChevronDown className="fv-steps-chevron" aria-hidden />
          </summary>
          <ol className="fv-steps-list">
            {data.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      </div>

      <p className="fv-note">{data.note}</p>
      <ShowcaseCompareBlock compare={data.compare} />
    </article>
  );
}

/** Kayıtlı radyo kesiti yoksa radyo kartı hiç çizilmez (boş liste öğesi de kalmaz). */
const HAS_RADIO = demoRadioPlaylist().length > 0;

/** Ana sayfa: üç kart, "Aynı not, iki ayrı sonuç" bölümünün içinde. */
export function FarkVitrini() {
  return (
    <div className="fv" data-testid="fark-vitrini">
      <p className="fv-kicker" id="fv-kicker">
        {FARK_VITRINI.kicker}
      </p>
      <ul className="fv-grid" aria-labelledby="fv-kicker">
        {HAS_RADIO ? (
          <li className="fv-cell">
            <RadioShowcaseCard />
          </li>
        ) : null}
        <li className="fv-cell">
          <RedPenShowcaseCard />
        </li>
        <li className="fv-cell fv-cell--share">
          <ClassShareShowcaseCard />
        </li>
      </ul>
    </div>
  );
}

/** /ornek sayfasının sonu: kayıtlı hesapta açılan iki araç, aynı kartlarla. */
export function SuperGuclerStrip() {
  return (
    <section className="fv fv--strip" aria-labelledby="fv-strip-title" data-testid="super-gucler">
      <h2 id="fv-strip-title" className="fv-strip-title">
        {FARK_VITRINI.stripTitle}
      </h2>
      <p className="fv-strip-lead">{FARK_VITRINI.stripLead}</p>
      <ul className="fv-grid fv-grid--pair">
        {HAS_RADIO ? (
          <li className="fv-cell">
            <RadioShowcaseCard />
          </li>
        ) : null}
        <li className="fv-cell">
          <RedPenShowcaseCard />
        </li>
      </ul>
    </section>
  );
}
