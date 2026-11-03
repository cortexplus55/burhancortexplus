import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingPage } from "@/components/layout/marketing-page";
import { programSources } from "@/lib/curriculum/registry";
import { outcomePath, shortText, SITE_BASE, treeLabelFor, unitBySlug, unitPath } from "@/lib/curriculum/seo";

type Params = { params: Promise<{ programId: string; unitId: string }> };

/** ~860 ünite sayfası: derlemede üretilmez, ilk istekte üretilip önbelleğe alınır (ISR). */
export const revalidate = 86400;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { programId, unitId } = await params;
  const hit = unitBySlug(programId, unitId);
  if (!hit) return { title: "Resmî Müfredat" };
  const path = unitPath(programId, hit.index);
  return {
    title: `${hit.title} — ${hit.program.label}`,
    description: shortText(`${hit.program.label} · ${hit.title}: ${hit.unit.outcomes.length} kazanım. ${hit.unit.outcomes[0]?.text ?? ""}`, 155),
    alternates: { canonical: `${SITE_BASE}${path}` },
  };
}

export default async function UnitPage({ params }: Params) {
  const { programId, unitId } = await params;
  const hit = unitBySlug(programId, unitId);
  if (!hit) notFound();
  const { program, unit, index, title } = hit;
  const label = treeLabelFor(program);
  return (
    <MarketingPage title={title} description={`${program.label} · ${unit.outcomes.length} kazanım`}>
      <p className="mk-eyebrow">
        <Link href={`/mufredat/${program.id}`}>← {program.label}</Link>
      </p>
      {label ? (
        <p className="mk-card mt-4 p-3 text-sm text-[var(--mk-muted)]" data-testid="tree-label">
          {label}
        </p>
      ) : null}
      <ol className="mt-6 grid gap-2" data-testid="unit-outcomes">
        {unit.outcomes.map((o, j) => (
          <li key={o.code} className="mk-card p-3 text-sm">
            <Link href={outcomePath(program.id, index, j)} className="text-[var(--mk-text)]">
              <strong>{o.code}</strong> {shortText(o.text, 220)}
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm">
        <Link href="/kayit" className="mk-btn-primary inline-flex px-6 py-2">Bu üniteye ücretsiz çalış</Link>
      </p>
      <p className="mt-6 text-xs text-[var(--mk-muted)]">
        Kaynak: {programSources(program).map((s) => s.publisher).join(" · ")}
      </p>
    </MarketingPage>
  );
}
