import type { WeakTopicRow } from "@/lib/learning/weak-topic-rows";

/**
 * Eksik konular (6 Kasım 2026): her satır ne ölçtüğünü yazar ("Son testte yanlış oranı %40"); çubuk yanlış oranıdır,
 * oranı olmayan kaynakta (sohbet) çubuk çizilmez. Önceden yalnız "100%" yazıyordu.
 */
export function TopicBars({ topics }: { topics: WeakTopicRow[] }) {
  if (!topics.length) {
    return (
      <p className="text-xs text-[var(--cs-muted)]">
        Henüz zayıf konu analizi yok.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {topics.map((topic) => (
        <li key={topic.label}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>{topic.label}</span>
            <span className="shrink-0 text-right text-[var(--cs-muted)]">
              {topic.note}
              {topic.times > 1 ? ` · ${topic.times} kez eksik çıktı` : ""}
            </span>
          </div>
          {topic.wrongPct != null ? (
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"
              role="img"
              aria-label={`Yanlış oranı yüzde ${topic.wrongPct}`}
            >
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${topic.wrongPct}%` }}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
