import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";
import { CURRICULUM, listProgramSummaries } from "@/lib/curriculum/registry";

export const metadata = {
  title: "Resmî Müfredat",
  description: "MEB öğretim programları ve ortak yazılı senaryolarından çıkarılan kazanım listesi, kaynaklarıyla.",
};

const EXAM_LABEL: Record<string, string> = { d1y1: "1. Yazılı", d1y2: "2. Yazılı" };

/**
 * Resmî müfredat dizini (1 Kasım 2026). Her satır resmî belgeden ayrıştırılır; kaynak, sürüm ve sha256
 * program sayfasında. Eksik kalan veri dürüstçe listelenir.
 */
export default function MufredatPage() {
  const programs = listProgramSummaries();
  const groups = new Map<string, typeof programs>();
  for (const p of programs) {
    const key = p.kind === "yks" ? "YKS (TYT / AYT)" : `${p.grade}. sınıf`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const outcomeTotal = programs.reduce((n, p) => n + p.outcomeCount, 0);
  return (
    <MarketingPage
      title="Resmî Müfredat"
      description={`${programs.length} program, ${outcomeTotal} kazanım. Veri sürümü ${CURRICULUM.version}; kaynaklar MEB, ÖDSGM ve ÖSYM belgeleri.`}
    >
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
