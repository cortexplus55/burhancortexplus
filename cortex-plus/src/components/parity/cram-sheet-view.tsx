import Link from "next/link";
import { CramPrintButton } from "@/components/parity/cram-print-button";
import { RichBody } from "@/components/parity/lesson-rich-text";
import {
  CRAM_EMPTY_TEXT,
  CRAM_KIND_LABEL,
  CRAM_SHEET_TITLE,
  CRAM_WEAK_HEADING,
  type CramSheet,
} from "@/lib/learning/cram-sheet";
import "@/styles/cram-sheet.css";

/**
 * Sınav sabahı kâğıdının gövdesi (Paket J denetimi: sayfadan ayrıldı ki uçtan uca test veritabanısız fikstürle aynı
 * bileşeni çizebilsin). Veri yükleme sayfada kalır.
 */
export function CramSheetView({
  sheet,
  prepTitle,
  examDay,
  homeHref,
}: {
  sheet: CramSheet;
  prepTitle: string;
  examDay: string | null;
  homeHref: string;
}) {
  return (
    <article className="cp-cram cp-cram-sheet" aria-labelledby="cram-title">
      <header className="cp-cram-head">
        <p className="cp-cram-kicker">
          {prepTitle}
          {examDay ? ` · Sınav ${examDay}` : ""}
        </p>
        <h1 id="cram-title" className="cp-cram-title">
          {CRAM_SHEET_TITLE}
        </h1>
        <p className="cp-cram-lead">
          Derslerinden derlendi: formüller, sınav ipuçları, tuzaklar ve en çok
          yanıldığın noktalar.
        </p>
        {sheet.empty ? null : (
          <div className="cp-cram-actions">
            <CramPrintButton />
          </div>
        )}
      </header>

      {sheet.empty ? (
        <div className="cp-cram-empty" role="status">
          <p>{CRAM_EMPTY_TEXT}</p>
          <Link href={homeHref} className="cp-cram-go">
            Yoluna dön
          </Link>
        </div>
      ) : (
        <>
          {sheet.focusTopics.length ? (
            <p className="cp-cram-focus">
              <strong>Önce bunlara bak: </strong>
              {sheet.focusTopics
                .map((topic) =>
                  topic.percent != null
                    ? `${topic.label} (%${topic.percent})`
                    : topic.label,
                )
                .join(" · ")}
            </p>
          ) : null}
          <div className="cp-cram-body">
            {sheet.weakSpots.length ? (
              <section
                className="cp-cram-section"
                aria-label="En çok yanıldığın noktalar"
              >
                <h2>{CRAM_WEAK_HEADING}</h2>
                <ul className="cp-cram-list">
                  {sheet.weakSpots.map((spot, index) => (
                    <li
                      key={`spot-${index}`}
                      className="cp-cram-item cp-cram-item--trap"
                    >
                      <RichBody text={spot.text} topicHint={spot.topic ?? ""} />
                      {spot.topic ? (
                        <span className="cp-cram-spot-topic">{spot.topic}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {sheet.sections.map((section, sectionIndex) => (
              <section
                key={`${section.topic}-${sectionIndex}`}
                className="cp-cram-section"
              >
                <h2>
                  {section.topic}
                  {section.weak ? (
                    <span className="cp-cram-weak">
                      Zayıf
                      {section.percent != null ? ` · %${section.percent}` : ""}
                    </span>
                  ) : null}
                </h2>
                <ul className="cp-cram-list">
                  {section.items.map((item, index) => (
                    <li
                      key={`${item.kind}-${index}`}
                      className={`cp-cram-item cp-cram-item--${item.kind}`}
                    >
                      <span className="cp-cram-tag">
                        {CRAM_KIND_LABEL[item.kind]}
                      </span>
                      {item.title ? (
                        <span className="cp-cram-item-title">
                          {item.title}:{" "}
                        </span>
                      ) : null}
                      <RichBody text={item.text} topicHint={section.topic} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="cp-cram-foot">Cortex Plus · {prepTitle}</p>
        </>
      )}
    </article>
  );
}
