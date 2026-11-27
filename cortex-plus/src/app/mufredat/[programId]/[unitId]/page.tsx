import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MarketingPage } from "@/components/layout/marketing-page";
import { SupersededNotice } from "@/components/curriculum/superseded-notice";
import { programSources } from "@/lib/curriculum/registry";
import {
  NOINDEX_FOLLOW,
  outcomePath,
  shortText,
  SITE_BASE,
  supersededBy,
  treeLabelFor,
  unitBySlug,
  unitPath,
} from "@/lib/curriculum/seo";
import { loadUnitPreview, type UnitPreviewResult } from "@/lib/curriculum/unit-preview";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { createServiceClient } from "@/lib/supabase/server";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";
import { curriculumBreadcrumb } from "@/lib/seo/curriculum-breadcrumb";
import { JsonLd } from "@/components/seo/json-ld";

type Params = { params: Promise<{ programId: string; unitId: string }> };

/** ~860 ünite sayfası: derlemede üretilmez, ilk istekte üretilip önbelleğe alınır (ISR). */
export const revalidate = 86400;
export function generateStaticParams() {
  return [];
}

/**
 * Havuz özeti istek başına bir kez okunur (metadata ve sayfa aynı sonucu kullanır). Okuma düşerse `error`: sayfa eski
 * hâliyle açılır ve dizinden çıkarılmaz; yalnız havuzda bu ünitenin güncel dersi gerçekten yoksa `noindex, follow`.
 */
const previewFor = cache(async (programId: string, unitIndex: number): Promise<UnitPreviewResult> => {
  try {
    return await loadUnitPreview(createServiceClient(), { programId, unitIndex });
  } catch {
    return { state: "error" };
  }
});

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

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { programId, unitId } = await params;
  const hit = unitBySlug(programId, unitId);
  if (!hit) return { title: "Resmî Müfredat" };
  const result = await previewFor(programId, hit.index);
  const lead = result.state === "ok" ? plain(result.preview.overview) : (hit.unit.outcomes[0]?.text ?? "");
  // Derin eşi olan eski konu ağacı ya da havuzda güncel dersi olmayan ünite arama motoruna önerilmez (27 Kasım 2026).
  const noindex = supersededBy(hit.program) !== null || result.state === "missing";
  // 20 Kasım 2026 (Faz 3): kanonik adresin yanında sayfaya özel paylaşım bilgisi (önce kökün ana sayfa adresi gidiyordu).
  return pageMetadata({
    title: `${hit.title} — ${hit.program.label}`,
    description: shortText(`${hit.program.label} · ${hit.title}: ${hit.unit.outcomes.length} kazanım. ${lead}`, 155),
    path: unitPath(programId, hit.index),
    robots: noindex ? NOINDEX_FOLLOW : undefined,
  });
}

export default async function UnitPage({ params }: Params) {
  const { programId, unitId } = await params;
  const hit = unitBySlug(programId, unitId);
  if (!hit) notFound();
  const { program, unit, index, title } = hit;
  const label = treeLabelFor(program);
  const current = supersededBy(program);
  const result = await previewFor(program.id, index);
  const preview = result.state === "ok" ? result.preview : null;
  const url = `${SITE_BASE}${unitPath(program.id, index)}`;

  return (
    <MarketingPage title={title} description={`${program.label} · ${unit.outcomes.length} kazanım`}>
      <JsonLd
        data={[
          ...(preview
            ? [
                {
                  "@type": "LearningResource",
                  name: `${title} — ${program.label}`,
                  url,
                  inLanguage: "tr",
                  learningResourceType: "Ünite özeti",
                  educationalLevel: program.label,
                  description: shortText(plain(preview.overview), 300),
                  teaches: unit.outcomes.map((o) => o.text),
                  isAccessibleForFree: true,
                  provider: { "@type": "Organization", name: "Cortex Plus", url: SITE_BASE },
                },
              ]
            : []),
          breadcrumbJsonLd(curriculumBreadcrumb({ program, unit: { index, title } })),
        ]}
      />
      <p className="mk-eyebrow">
        <Link href={`/mufredat/${program.id}`}>← {program.label}</Link>
      </p>
      {label ? (
        <p className="mk-card mt-4 p-3 text-sm text-[var(--mk-muted)]" data-testid="tree-label">
          {label}
        </p>
      ) : null}
      {current ? <SupersededNotice current={current} /> : null}

      {preview ? (
        <div className="mt-6 grid gap-6" data-testid="unit-preview">
          <section className="mk-card p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--mk-text)]">Bu ünitede ne öğreneceksin</h2>
            <Rich text={preview.overview} className="cp-md mt-3 space-y-3 text-[15px] leading-relaxed text-[var(--mk-text)]" />
          </section>

          <section aria-labelledby="unit-outcomes-title">
            <h2 id="unit-outcomes-title" className="text-lg font-semibold text-[var(--mk-text)]">
              Kazanımlar
            </h2>
            <ol className="mt-3 grid gap-3" data-testid="unit-outcomes">
              {unit.outcomes.map((o, j) => {
                const item = preview.outcomes[j];
                return (
                  <li key={o.code} className="mk-card p-4 text-sm">
                    <Link href={outcomePath(program.id, index, j)} className="-my-1.5 block py-2.5 text-[var(--mk-text)]">
                      <strong>{o.code}</strong> {shortText(o.text, 220)}
                    </Link>
                    {item?.heading ? (
                      <h3 className="mt-3 text-[15px] font-semibold text-[var(--mk-text)]">{item.heading}</h3>
                    ) : null}
                    {item?.lead ? <p className="mt-1 text-[15px] leading-relaxed text-[var(--mk-muted)]">{item.lead}</p> : null}
                    {item?.keyPoints.length ? (
                      <ul className="mt-2 grid gap-1.5 text-[15px] text-[var(--mk-text)]">
                        {item.keyPoints.map((point, i) => (
                          <li key={i} className="flex gap-2">
                            <span aria-hidden className="text-[var(--mk-primary)]">
                              •
                            </span>
                            <Rich text={point} className="min-w-0" />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>

          {preview.keyTerms.length ? (
            <section className="mk-card p-4 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--mk-text)]">Ünitenin kavramları</h2>
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

          {preview.summary ? (
            <section className="mk-card p-4 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--mk-text)]">Ünite özeti</h2>
              <Rich text={preview.summary} className="cp-md mt-3 space-y-3 text-[15px] leading-relaxed text-[var(--mk-text)]" />
            </section>
          ) : null}
        </div>
      ) : (
        <ol className="mt-6 grid gap-2" data-testid="unit-outcomes">
          {unit.outcomes.map((o, j) => (
            <li key={o.code} className="mk-card p-3 text-sm">
              <Link href={outcomePath(program.id, index, j)} className="text-[var(--mk-text)]">
                <strong>{o.code}</strong> {shortText(o.text, 220)}
              </Link>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-8 text-sm">
        <Link href="/kayit" className="mk-btn-primary inline-flex px-6 py-2">Bu üniteye ücretsiz çalış</Link>
      </p>
      <p className="mt-6 text-xs text-[var(--mk-muted)]">
        Kaynak: {programSources(program).map((s) => s.publisher).join(" · ")}
      </p>
    </MarketingPage>
  );
}
