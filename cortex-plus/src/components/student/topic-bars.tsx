export function TopicBars({
  topics,
}: {
  topics: { label: string; severity: number }[];
}) {
  if (!topics.length) {
    return (
      <p className="text-xs text-[var(--astra-muted)]">
        Henüz zayıf konu analizi yok.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {topics.map((topic) => {
        const pct = Math.min(100, Math.round(topic.severity * 100));
        return (
          <li key={topic.label}>
            <div className="flex items-center justify-between text-xs">
              <span>{topic.label}</span>
              <span className="text-[var(--astra-muted)]">{pct}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
