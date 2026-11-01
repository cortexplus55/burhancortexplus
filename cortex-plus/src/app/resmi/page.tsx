import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";
import { CURRICULUM } from "@/lib/curriculum/registry";

export const metadata = {
  title: "Resmî Takvim ve Sınav Yapıları",
  description: "ÖSYM, ÖDSGM, MEB ve Diyanet belgelerinden takvim, sınav yapıları ve eksik veri listesi.",
};

const KIND_LABEL = { sinav: "Merkezî sınav", meb: "MEB çalışma takvimi", dini: "Dinî bayram" } as const;

function trDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export default function ResmiPage() {
  const src = CURRICULUM.sources;
  const events = [...CURRICULUM.calendar].sort((a, b) => a.starts.localeCompare(b.starts));
  const exams = new Map<string, typeof CURRICULUM.examStructures>();
  for (const row of CURRICULUM.examStructures) exams.set(row.exam, [...(exams.get(row.exam) ?? []), row]);
  return (
    <MarketingPage
      title="Resmî Takvim ve Sınav Yapıları"
      description={`Veri sürümü ${CURRICULUM.version}. Her satırın kaynağı ve sha256 özeti aşağıda.`}
    >
      <p className="mk-eyebrow">
        <Link href="/mufredat">Resmî müfredat →</Link>
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--mk-text)]">Takvim</h2>
        <ul className="mt-3 grid gap-2 text-sm" data-testid="resmi-calendar">
          {events.map((e) => (
            <li key={e.id} className="mk-card flex flex-wrap justify-between gap-2 p-3">
              <span className="text-[var(--mk-text)]">
                <strong>{e.label}</strong>
                <span className="text-xs text-[var(--mk-muted)]"> · {KIND_LABEL[e.kind]}</span>
              </span>
              <span className="text-xs text-[var(--mk-muted)]">
                {e.starts === e.ends ? trDate(e.starts) : `${trDate(e.starts)} – ${trDate(e.ends)}`} ·{" "}
                <a href={src[e.sourceId]?.url} target="_blank" rel="noreferrer">
                  {src[e.sourceId]?.publisher ?? e.sourceId}
                </a>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--mk-text)]">Sınav yapıları</h2>
        {[...exams.entries()].map(([exam, rows]) => (
          <div key={exam} className="mk-card mt-3 overflow-x-auto p-3 text-sm">
            <h3 className="font-semibold text-[var(--mk-text)]">{exam}</h3>
            <table className="mt-2 w-full text-left text-xs text-[var(--mk-muted)]">
              <thead>
                <tr>
                  <th>Bölüm</th>
                  <th>Ders</th>
                  <th>Soru</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.order}>
                    <td>{r.section}</td>
                    <td>{r.subject}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 break-all text-[11px] text-[var(--mk-muted)]">
              Kaynak: <a href={src[rows[0]!.sourceId]?.url}>{src[rows[0]!.sourceId]?.title}</a>
            </p>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--mk-text)]">Eksik ya da dışarıda bırakılan veri</h2>
        <p className="mt-1 text-sm text-[var(--mk-muted)]">
          Ayrıştırılamayan ya da doğrulanamayan bölümler tahminle doldurulmadı; aşağıda nedeniyle listelendi.
        </p>
        <ul className="mt-3 grid gap-2 text-xs text-[var(--mk-muted)]" data-testid="resmi-excluded">
          {CURRICULUM.excluded.map((x, i) => (
            <li key={i} className="mk-card p-3">
              <strong className="text-[var(--mk-text)]">
                {x.section}
                {x.code ? ` · ${x.code}` : ""}
              </strong>{" "}
              — {x.reason} <span>({src[x.source]?.title ?? x.source})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--mk-text)]">Tüm kaynaklar</h2>
        <ul className="mt-3 grid gap-2 text-[11px] text-[var(--mk-muted)]">
          {Object.values(src).map((s) => (
            <li key={s.id} className="mk-card break-all p-3">
              <a href={s.url} target="_blank" rel="noreferrer" className="text-[var(--mk-text)]">
                {s.publisher} — {s.title}
              </a>{" "}
              · sha256 {s.sha256}
            </li>
          ))}
        </ul>
      </section>
    </MarketingPage>
  );
}
