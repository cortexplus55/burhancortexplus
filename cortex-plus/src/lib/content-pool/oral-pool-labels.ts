/** Sözlü sınavın havuz konuları (saf): seçilen konular ya da "Tüm sınav"da listeye eşit aralıkla yayılan konular. */
export function oralPoolLabelsFrom(
  rows: readonly { id: string; label: string }[],
  input: { topicLabel: string; all: boolean; topicIds: readonly string[] | null | undefined; count: number },
): string[] {
  const labels = rows.map((row) => String(row.label ?? "").trim()).filter(Boolean);
  if (input.topicIds?.length) {
    const wanted = new Set(input.topicIds);
    const picked = rows.filter((row) => wanted.has(row.id)).map((row) => row.label.trim()).filter(Boolean);
    return picked.length ? picked : [input.topicLabel];
  }
  if (!input.all || !labels.length) return [input.topicLabel];
  const n = Math.max(1, Math.min(labels.length, Math.floor(input.count) || 1));
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(labels[Math.floor((i * labels.length) / n)]!);
  return [...new Set(out)];
}
