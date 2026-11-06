import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { programSources } from "@/lib/curriculum/registry";
import { outcomeBySlug, outcomePath, shortText, SITE_BASE, treeLabelFor, unitPath } from "@/lib/curriculum/seo";
import { cleanMathGlyphs } from "@/lib/curriculum/math-glyphs";
import { loadOutcomePreview, type OutcomePreview } from "@/lib/curriculum/outcome-preview";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ programId: string; unitId: string; outcomeId: string }> };

/** ~4200 kazanım sayfası: ilk istekte üretilir, önbellekte kalır (ISR). */
export const revalidate = 86400;
export function generateStaticParams() {
  return [];
}

/**
 * Havuz ön izlemesi istek başına bir kez okunur (metadata ve sayfa aynı sonucu kullanır). Okuma düşerse null:
 * sayfa yine açılır, yalnız ince kalır ve arama motoruna `noindex` gider.
 */
const previewFor = cache(async (programId: string, unitIndex: number, outcomeCode: string, outcomeIndex: number) => {
  try {
    return await loadOutcomePreview(createServiceClient(), { programId, unitIndex, outcomeCode, outcomeIndex });
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { programId, unitId, outcomeId } = await params;
  const hit = outcomeBySlug(programId, unitId, outcomeId);
  if (!hit) return { title: "Resmî Müfredat" };
  const preview = await previewFor(programId, hit.index, hit.outcome.code, hit.oIndex);
  const lead = preview ? plain(preview.explanation) : hit.outcome.text;
  return {
    title: `${hit.outcome.code} ${shortText(hit.outcome.text, 60)} — ${hit.program.label}`,
    description: shortText(`${hit.title}: ${hit.outcome.text}. ${lead}`, 155),
    alternates: { canonical: `${SITE_BASE}${outcomePath(programId, hit.index, hit.oIndex)}` },
    // Havuz bölümü olmayan kazanım sayfası ince kalır; arama motoruna önerilmez (6 Kasım 2026).
    ...(preview ? {} : { robots: { index: false, follow: true } }),
  };
}

/** Markdown'sız düz metin (açıklama alanı ve yapılandırılmış veri için). */
function plain(markdown: string): string {
  return markdown
    .replace(/\*\*|__|`|\$+/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function Rich({ text, className }: { text: string; className?: string }) {
  // renderMarkdownToHtml önce kaçış yapar, sonra yalnız izinli etiketleri kurar (ders metniyle aynı yol).
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(text) }} />;
}

function structuredData(input: {
  url: string;
  code: string;
  outcomeText: string;
  unitTitle: string;
  programLabel: string;
  preview: OutcomePreview | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: `${input.code} — ${input.unitTitle}`,
    url: input.url,
    inLanguage: "tr",
    learningResourceType: "Ders anlatımı",
    educationalLevel: input.programLabel,
    teaches: input.outcomeText,
    isAccessibleForFree: true,
    provider: { "@type": "Organization", name: "Cortex Plus", url: SITE_BASE },
    ...(input.preview ? { description: shortText(plain(input.preview.explanation), 300) } : {}),
  };
}

export default async function OutcomePage({ params }: Params) {
  const { programId, unitId, outcomeId } = await params;
  const hit = outcomeBySlug(programId, unitId, outcomeId);
  if (!hit) notFound();
  const { program, unit, index, title, outcome, oIndex } = hit;
  const label = treeLabelFor(program);
  const prev = oIndex > 0 ? outcomePath(program.id, index, oIndex - 1) : null;
  // Etiket sayfanın üstünde zaten gösteriliyor; aynı metin sınırlamalarda tekrar basılmaz.
  const limitations = outcome.limitations.map(cleanMathGlyphs).filter((l) => l.trim() !== label);
  const next = oIndex < unit.outcomes.length - 1 ? outcomePath(program.id, index, oIndex + 1) : null;
  const preview = await previewFor(program.id, index, outcome.code, oIndex);
  const siblings = unit.outcomes
    .map((o, j) => ({ code: o.code, text: o.text, href: outcomePath(program.id, index, j), self: j === oIndex }))
    .filter((o) => !o.self)
    .slice(0, 8);
  const url = `${SITE_BASE}${outcomePath(program.id, index, oIndex)}`;

  return (
    <MarketingPage title={`${outcome.code} — ${title}`} description={program.label}>
      <script
        type="application/ld+json"
        // JSON.stringify yalnız veri; "<" kaçışı betik etiketinin erken kapanmasını engeller.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            structuredData({ url, code: outcome.code, outcomeText: outcome.text, unitTitle: title, programLabel: program.label, preview }),
          ).replace(/</g, "\\u003c"),
        }}
      />
      <p className="mk-eyebrow">
        <Link href={unitPath(program.id, index)}>← {title}</Link>
      </p>
      {label ? (
        <p className="mk-card mt-4 p-3 text-sm text-[var(--mk-muted)]" data-testid="tree-label">
          {label}
        </p>
      ) : null}
      <section className="mk-card mt-6 p-4 text-sm" data-testid="outcome-text">
        <h2 className="text-base font-semibold text-[var(--mk-text)]">Kazanım</h2>
        <p className="mt-2 text-[var(--mk-text)]">{outcome.text}</p>
        {limitations.length ? (
          <ul className="mt-3 list-disc pl-5 text-sm text-[var(--mk-muted)]">
            {limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {preview ? (
        <div className="mt-6 grid gap-6" data-testid="outcome-preview">
          <section className="mk-card p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--mk-text)]">{preview.heading}</h2>
            <Rich text={preview.explanation} className="cp-md mt-3 space-y-3 text-[15px] leading-relaxed text-[var(--mk-text)]" />
          </section>

          {preview.keyPoints.length ? (
            <section className="mk-card p-4 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--mk-text)]">Kilit noktalar</h2>
              <ul className="mt-3 grid gap-2 text-[15px] text-[var(--mk-text)]">
                {preview.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-[var(--mk-primary)]">•</span>
                    <Rich text={point} className="min-w-0" />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {preview.workedExample ? (
            <section className="mk-card p-4 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--mk-text)]">Çözümlü örnek</h2>
              <Rich text={preview.workedExample} className="mt-3 space-y-2 text-[15px] leading-relaxed text-[var(--mk-text)]" />
            </section>
          ) : null}

          {preview.commonMistakes.length ? (
            <section className="mk-card p-4 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--mk-text)]">Sık yapılan hatalar</h2>
              <ul className="mt-3 grid gap-2 text-[15px] text-[var(--mk-text)]">
                {preview.commonMistakes.map((mistake, i) => (
                  <li key={i}>
                    <Rich text={mistake} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {preview.keyTerms.length ? (
            <section className="mk-card p-4 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--mk-text)]">Kavramlar</h2>
              <dl className="mt-3 grid gap-3 text-[15px]">
                {preview.keyTerms.map((t) => (
                  <div key={t.term}>
                    <dt className="font-semibold text-[var(--mk-text)]">{t.term}</dt>
                    <dd className="mt-0.5 text-[var(--mk-muted)]">{t.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {preview.sampleQuestion ? (
            <section className="mk-card p-4 sm:p-6" data-testid="sample-question">
              <h2 className="text-base font-semibold text-[var(--mk-text)]">Örnek soru</h2>
              <Rich text={preview.sampleQuestion.stem} className="mt-3 text-[15px] text-[var(--mk-text)]" />
              <ol className="mt-3 grid gap-2 text-[15px] text-[var(--mk-text)]" type="A">
                {preview.sampleQuestion.choices.map((choice, i) => (
                  <li key={i} className="rounded-lg border border-[var(--mk-border)] px-3 py-2">
                    <span className="mr-2 font-semibold">{String.fromCharCode(65 + i)})</span>
                    {choice}
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-sm text-[var(--mk-muted)]">
                Cevabı ve adım adım çözümü görmek, benzer sorularla pratik yapmak için ücretsiz kaydol.
              </p>
            </section>
          ) : null}

          {preview.unitOverview ? (
            <section className="mk-card p-4 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--mk-text)]">Ünite hakkında</h2>
              <Rich text={preview.unitOverview} className="mt-3 space-y-2 text-[15px] leading-relaxed text-[var(--mk-muted)]" />
            </section>
          ) : null}
        </div>
      ) : null}

      {siblings.length ? (
        <section className="mt-6" data-testid="sibling-outcomes">
          <h2 className="text-base font-semibold text-[var(--mk-text)]">Bu ünitenin öbür kazanımları</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {siblings.map((s) => (
              <li key={s.code}>
                <Link href={s.href} className="text-[var(--mk-text)] underline-offset-4 hover:underline">
                  <strong>{s.code}</strong> {shortText(s.text, 140)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="mt-6 flex flex-wrap gap-4 text-sm" aria-label="Kazanımlar arası">
        {prev ? <Link href={prev}>← Önceki kazanım</Link> : null}
        {next ? <Link href={next}>Sonraki kazanım →</Link> : null}
      </nav>
      <p className="mt-8 text-sm">
        <Link href="/kayit" className="mk-btn-primary inline-flex px-6 py-2">Bu kazanıma ücretsiz çalış</Link>
      </p>
      <p className="mt-6 text-sm text-[var(--mk-muted)]">
        Kaynak: {programSources(program).map((s) => s.publisher).join(" · ")}
        {preview ? " · Anlatım ve soru Cortex Plus öğretmen motoruyla yazıldı ve kazanıma karşı denetlendi." : ""}
      </p>
    </MarketingPage>
  );
}
