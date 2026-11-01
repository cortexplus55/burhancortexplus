import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingPage } from "@/components/layout/marketing-page";
import { CURRICULUM, getProgram, programSources } from "@/lib/curriculum/registry";

const EXAM_LABEL: Record<string, string> = {
  d1y1: "1. Dönem 1. Ortak Yazılı",
  d1y2: "1. Dönem 2. Ortak Yazılı",
};

export function generateStaticParams() {
  return CURRICULUM.programs.map((p) => ({ programId: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const program = getProgram(programId);
  return { title: program ? `${program.label} — Resmî Müfredat` : "Resmî Müfredat" };
}

export default async function ProgramPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const program = getProgram(programId);
  if (!program) notFound();
  const sources = programSources(program);
  const exams = Object.entries(program.exams);
  return (
    <MarketingPage title={program.label} description={`${program.badge} · ${program.scope}`}>
      <p className="mk-eyebrow">
        <Link href="/mufredat">← Tüm programlar</Link>
      </p>
      {exams.length ? (
        <section className="mk-card mt-6 p-4 text-sm text-[var(--mk-muted)]">
          {exams.map(([key, info]) => (
            <p key={key}>
              <strong className="text-[var(--mk-text)]">{EXAM_LABEL[key] ?? key}:</strong>{" "}
              {info.national
                ? "Ülke geneli ortak sınav — soru dağılımı sınav öncesi kılavuzla yayımlanacak; tablo yok."
                : `Senaryo ${info.scenarios.join(", ")} (MEB konu-soru dağılım tablosu).`}
            </p>
          ))}
        </section>
      ) : null}
      {program.units.map((unit) => (
        <section key={unit.title} className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--mk-text)]">{unit.title}</h2>
          <ul className="mt-3 grid gap-2">
            {unit.outcomes.map((o) => {
              const quotaText = Object.entries(o.quotas)
                .map(([k, q]) => {
                  const parts = Object.entries(q).map(([s, n]) => `S${s}:${n}`);
                  return parts.length ? `${EXAM_LABEL[k]?.replace("1. Dönem ", "") ?? k} ${parts.join(" ")}` : "";
                })
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={o.code} className="mk-card p-3 text-sm">
                  <p className="text-[var(--mk-text)]">
                    <strong>{o.code}</strong> {o.text}
                  </p>
                  {quotaText ? <p className="mt-1 text-xs text-[var(--mk-muted)]">Soru sayısı: {quotaText}</p> : null}
                  {o.limitations.length ? (
                    <details className="mt-1 text-xs text-[var(--mk-muted)]">
                      <summary>Programın sınırlamaları / açıklamaları</summary>
                      <ul className="mt-1 list-disc pl-5">
                        {o.limitations.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--mk-text)]">Kaynaklar</h2>
        <ul className="mt-3 grid gap-2 text-xs text-[var(--mk-muted)]" data-testid="mufredat-sources">
          {sources.map((s) => (
            <li key={s.id} className="mk-card break-all p-3">
              <a href={s.url} target="_blank" rel="noreferrer" className="text-[var(--mk-text)]">
                {s.publisher} — {s.title}
              </a>
              <br />
              sürüm {s.program_version} · sha256 {s.sha256} · alındı {s.fetched_at.slice(0, 10)}
            </li>
          ))}
        </ul>
      </section>
    </MarketingPage>
  );
}
