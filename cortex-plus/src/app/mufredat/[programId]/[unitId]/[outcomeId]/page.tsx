import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingPage } from "@/components/layout/marketing-page";
import { programSources } from "@/lib/curriculum/registry";
import { outcomeBySlug, outcomePath, shortText, SITE_BASE, treeLabelFor, unitPath } from "@/lib/curriculum/seo";
import { cleanMathGlyphs } from "@/lib/curriculum/math-glyphs";

type Params = { params: Promise<{ programId: string; unitId: string; outcomeId: string }> };

/** ~4200 kazanım sayfası: ilk istekte üretilir, önbellekte kalır (ISR). */
export const revalidate = 86400;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { programId, unitId, outcomeId } = await params;
  const hit = outcomeBySlug(programId, unitId, outcomeId);
  if (!hit) return { title: "Resmî Müfredat" };
  return {
    title: `${hit.outcome.code} ${shortText(hit.outcome.text, 60)} — ${hit.program.label}`,
    description: shortText(`${hit.title}: ${hit.outcome.text}`, 155),
    alternates: { canonical: `${SITE_BASE}${outcomePath(programId, hit.index, hit.oIndex)}` },
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
  return (
    <MarketingPage title={`${outcome.code} — ${title}`} description={program.label}>
      <p className="mk-eyebrow">
        <Link href={unitPath(program.id, index)}>← {title}</Link>
      </p>
      {label ? (
        <p className="mk-card mt-4 p-3 text-sm text-[var(--mk-muted)]" data-testid="tree-label">
          {label}
        </p>
      ) : null}
      <section className="mk-card mt-6 p-4 text-sm" data-testid="outcome-text">
        <p className="text-[var(--mk-text)]">{outcome.text}</p>
        {limitations.length ? (
          <ul className="mt-3 list-disc pl-5 text-xs text-[var(--mk-muted)]">
            {limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : null}
      </section>
      <nav className="mt-6 flex flex-wrap gap-4 text-sm" aria-label="Kazanımlar arası">
        {prev ? <Link href={prev}>← Önceki kazanım</Link> : null}
        {next ? <Link href={next}>Sonraki kazanım →</Link> : null}
      </nav>
      <p className="mt-8 text-sm">
        <Link href="/kayit" className="mk-btn-primary inline-flex px-6 py-2">Bu kazanıma ücretsiz çalış</Link>
      </p>
      <p className="mt-6 text-xs text-[var(--mk-muted)]">
        Kaynak: {programSources(program).map((s) => s.publisher).join(" · ")}
      </p>
    </MarketingPage>
  );
}
