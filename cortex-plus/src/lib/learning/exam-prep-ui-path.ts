/**
 * Stage 9 — pure helpers for daily study path / calendar grouping in the UI.
 */

export type PathNodeLike = {
  id: string;
  dayIndex: number;
  status: "locked" | "ready" | "done";
  sessionMeta?: {
    calendarDate?: string;
    durationMinutes?: number;
    topicTitle?: string;
    role?: string;
  } | null;
};


export type TopicNodeLike = {
  id: string;
  sortOrder: number;
  status: "locked" | "ready" | "done";
  sessionMeta?: { topicId?: string; topicTitle?: string } | null;
};

function foldTitle(text: string | undefined | null): string {
  return (text ?? "").trim().toLocaleLowerCase("tr");
}

/**
 * "Konu seç" ekranında seçilen konunun açılacak etkinliği.
 *
 * Eskiden seçim yalnızca `active_topic_id` alanını yazıyor, öğrenci ise
 * PLANDAKİ İLK HAZIR düğüme gönderiliyordu — hangi konuya ait olursa
 * olsun. Canlıda "Zeminin Oluşumu"nu seçmek "Efektif Gerilme" dersini
 * açıyordu. Seçim ekranı öğrenciye bir söz veriyor; tutmayan söz,
 * olmayan ekrandan kötüdür.
 *
 * Eşleştirme önce `topicId` ile: düğüm hangi konuya yazıldıysa o. Eski
 * planlarda bu alan yok, orada başlık eşleşmesine düşülüyor.
 *
 * Bitmemiş ilk etkinlik seçilir. Konunun hepsi bitmişse ilk etkinlik
 * döner: öğrenci bitirdiği konuya geri dönüp okuyabilmeli.
 */
export function nodeForTopic(
  nodes: TopicNodeLike[],
  topic: { id: string; label?: string | null },
): TopicNodeLike | null {
  const label = foldTitle(topic.label);
  const mine = nodes
    .filter((node) => {
      const metaId = node.sessionMeta?.topicId;
      if (metaId) return metaId === topic.id;
      return label ? foldTitle(node.sessionMeta?.topicTitle) === label : false;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (!mine.length) return null;
  return mine.find((node) => node.status !== "done") ?? mine[0];
}

export type LearningPreferencesView = {
  style?: "examples" | "theory" | "mixed";
  pace?: "slow" | "normal" | "fast";
  notes?: string;
};

export function parseLearningPreferences(raw: unknown): LearningPreferencesView {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const style =
    o.style === "examples" || o.style === "theory" || o.style === "mixed"
      ? o.style
      : undefined;
  const pace =
    o.pace === "slow" || o.pace === "normal" || o.pace === "fast"
      ? o.pace
      : undefined;
  const notes = typeof o.notes === "string" ? o.notes.slice(0, 400) : undefined;
  return { style, pace, notes };
}

export type TopicProgress = {
  title: string;
  done: number;
  total: number;
  pct: number;
  /** İlk etkinliğin geldiği gün — konular plandaki sıraya göre dizilsin. */
  firstDayIndex: number;
};

/**
 * Konu başına ilerleme.
 *
 * Astra'nın "Konular" sekmesinde her konunun yanında yüzdesi ve
 * "0 tamamlandı" yazıyor; öğrenci nerede kaldığını konu bazında
 * görüyor. Bizde yalnızca toplam yüzde vardı ve konu listesi ayrı bir
 * sayfada, ilerleme bilgisi olmadan duruyordu.
 *
 * Yeni sorgu gerekmiyor: plan düğümleri zaten hangi konuya ait olduğunu
 * taşıyor. Konusu belli olmayan düğümler (deneme sınavı, genel tekrar)
 * bir konuya yazılamaz, o yüzden dışarıda kalıyor.
 */
export function topicProgressFromNodes(nodes: PathNodeLike[]): TopicProgress[] {
  const byTitle = new Map<string, { done: number; total: number; firstDayIndex: number }>();

  for (const node of nodes) {
    const title = node.sessionMeta?.topicTitle?.trim();
    if (!title) continue;
    const row = byTitle.get(title) ?? {
      done: 0,
      total: 0,
      firstDayIndex: node.dayIndex,
    };
    row.total += 1;
    if (node.status === "done") row.done += 1;
    row.firstDayIndex = Math.min(row.firstDayIndex, node.dayIndex);
    byTitle.set(title, row);
  }

  return [...byTitle.entries()]
    .map(([title, row]) => ({
      title,
      done: row.done,
      total: row.total,
      // Bir etkinlik bitmişken %0 göstermek çalışmayı yok saymak olur.
      pct: row.total ? Math.round((row.done / row.total) * 100) : 0,
      firstDayIndex: row.firstDayIndex,
    }))
    .sort((a, b) => a.firstDayIndex - b.firstDayIndex || a.title.localeCompare(b.title, "tr"));
}
