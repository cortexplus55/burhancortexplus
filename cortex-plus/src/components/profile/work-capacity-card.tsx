import { remainingCapacity } from "@/lib/credits/price-table";

/** Faz 4 /ayarlar "Akıllı Hak Çevirici": kalan kredinin somut iş karşılığı. Yeniden çözmek her zaman ücretsiz. */
export const WORK_CAPACITY_COPY = {
  title: "Kalan Çalışma Kapasiten",
  lead: "Kalan hakkınla bugün yapabileceklerin:",
  lessons: "ders",
  tests: "test",
  chats: "sohbet",
  restudy: "Bitirdiğin adımları yeniden çözmek bu kapasiteden düşmez (%100 ücretsiz tekrar).",
} as const;

export function WorkCapacityCard({ remaining }: { remaining: number }) {
  const work = remainingCapacity(remaining);
  const tr = (value: number) => value.toLocaleString("tr-TR");
  const cells = [
    { key: "lessons", value: work.lessons, label: WORK_CAPACITY_COPY.lessons },
    { key: "tests", value: work.tests, label: WORK_CAPACITY_COPY.tests },
    { key: "chats", value: work.chats, label: WORK_CAPACITY_COPY.chats },
  ] as const;
  return (
    <section className="cp-capacity" aria-label={WORK_CAPACITY_COPY.title} data-testid="work-capacity">
      <h3 className="cp-capacity-title">{WORK_CAPACITY_COPY.title}</h3>
      <p className="cp-capacity-lead">{WORK_CAPACITY_COPY.lead}</p>
      <ul className="cp-capacity-grid">
        {cells.map((cell) => (
          <li key={cell.key} className="cp-capacity-cell">
            <strong>{tr(cell.value)}</strong>
            <span>{cell.label}</span>
          </li>
        ))}
      </ul>
      <p className="cp-capacity-note">{WORK_CAPACITY_COPY.restudy}</p>
    </section>
  );
}
