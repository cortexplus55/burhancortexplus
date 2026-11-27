import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";
import { CURRICULUM, listProgramSummaries } from "@/lib/curriculum/registry";
import { programGroupLabel } from "@/lib/curriculum/program-group";
import { pageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, itemListJsonLd, webPageJsonLd } from "@/lib/seo/structured-data";
import { CURRICULUM_INDEX_TITLE } from "@/lib/seo/curriculum-breadcrumb";
import { JsonLd } from "@/components/seo/json-ld";

// Kanonik adres ve sayfaya özel paylaşım bilgisi (20 Kasım 2026, Faz 3).
const MUFREDAT_DESCRIPTION =
  "MEB öğretim programları ve ortak yazılı senaryolarından çıkarılan kazanım listesi, kaynaklarıyla.";

export const metadata = pageMetadata({
  title: "Resmî Müfredat",
  description: MUFREDAT_DESCRIPTION,
  path: "/mufredat",
});

const EXAM_LABEL: Record<string, string> = { d1y1: "1. Yazılı", d1y2: "2. Yazılı" };

function topicLine(counts: Record<string, number>): string {
  if ("all" in counts) return `${counts.all} konu`;
  return Object.entries(counts)
    .map(([part, n]) => `${part} ${n} konu`)
    .join(" · ");
}

/**
 * Resmî müfredat dizini (1 Kasım 2026). Her satır resmî belgeden ayrıştırılır; kaynak, sürüm ve sha256
 * program sayfasında. Eksik kalan veri dürüstçe listelenir.
 */
export default function MufredatPage() {
  const programs = listProgramSummaries();
  const groups = new Map<string, typeof programs>();
  for (const p of programs) {
    const key = programGroupLabel(p);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const outcomeTotal = programs.reduce((n, p) => n + p.outcomeCount, 0);
  // Uzun liste: son bölümün kartları altbilgiye ve çerez bandına yapışmasın (Faz 9, 20 Kasım 2026; pb-16 → pb-24).
  return (
    <MarketingPage
      title="Resmî Müfredat"
      description={`${programs.length} program, ${outcomeTotal} kazanım. Veri sürümü ${CURRICULUM.version}; kaynaklar MEB, ÖDSGM ve ÖSYM belgeleri.`}
      contentClassName="pb-24"
    >
      {/* Liste sayfası: programlar sayfadaki sırayla, gezinme yolu (26 Kasım 2026). */}
      <JsonLd
        data={[
          webPageJsonLd({
            type: "CollectionPage",
            name: CURRICULUM_INDEX_TITLE,
            description: MUFREDAT_DESCRIPTION,
            path: "/mufredat",
            mainEntity: itemListJsonLd(
              [...groups.values()].flat().map((p) => ({ name: p.label, path: `/mufredat/${p.id}` })),
            ),
          }),
          breadcrumbJsonLd([
            { name: "Cortex Plus", path: "/" },
            { name: CURRICULUM_INDEX_TITLE, path: "/mufredat" },
          ]),
        ]}
      />
      <p className="mk-eyebrow">
        <Link href="/resmi">Resmî takvim, sınav yapıları ve eksik veri →</Link>
      </p>
      {[...groups.entries()].map(([group, list]) => (
        <section key={group} className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--mk-text)]">{group}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="mufredat-list">
            {list.map((p) => (
              <li key={p.id} className="mk-card p-4">
                <Link href={`/mufredat/${p.id}`} className="font-semibold text-[var(--mk-text)]">
                  {p.label}
                </Link>
                <p className="mt-1 text-xs text-[var(--mk-muted)]">
                  {p.badge} · {p.unitCount} ünite · {p.outcomeCount} kazanım
                </p>
                <p className="mt-1 text-xs text-[var(--mk-muted)]" data-testid="mufredat-topics">
                  {topicLine(p.topicCounts)}
                </p>
                <p className="mt-1 text-xs text-[var(--mk-muted)]">
                  {Object.entries(p.exams)
                    .map(([k, e]) =>
                      e.national
                        ? `${EXAM_LABEL[k] ?? k}: ülke geneli`
                        : `${EXAM_LABEL[k] ?? k}: ${e.scenarios.length} senaryo`,
                    )
                    .join(" · ") || p.scope}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </MarketingPage>
  );
}
