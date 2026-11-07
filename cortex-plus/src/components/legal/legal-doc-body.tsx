import type { ReadableDoc } from "@/lib/legal/legal-docs";

/**
 * Hukuki metnin gövdesi: önce "Kısaca" özeti (varsa), sonra numaralı bölümler. Okuma penceresi ve onay kapısı aynı
 * bileşeni çizer; metnin kendisi `src/lib/legal/*-text.ts`'ten gelir, burada yazı yoktur.
 */
export function LegalDocBody({ doc }: { doc: ReadableDoc }) {
  let counter = 0;
  return (
    <div className="cp-legal-doc">
      {doc.summary?.length ? (
        <section className="cp-legal-summary" aria-label="Kısaca">
          <p className="cp-legal-summary-title">Kısaca</p>
          <ul>
            {doc.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {doc.parts.map((part) => (
        <div key={part.title ?? doc.id}>
          {part.title ? <h2 className="cp-legal-part-title">{part.title}</h2> : null}
          {part.sections.map((section) => {
            counter += 1;
            return (
              <section key={`${part.title ?? ""}-${section.heading}`}>
                <h3>
                  {counter}. {section.heading}
                </h3>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}
