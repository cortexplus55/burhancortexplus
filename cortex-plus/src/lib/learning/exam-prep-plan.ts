export type PlanNodeKind =
  | "lesson"
  | "podcast"
  | "qa"
  | "quiz"
  | "true_false"
  | "oral"
  | "spaced"
  | "gaps"
  | "flashcards"
  | "written_exam";

export type NodeStatus = "locked" | "ready" | "done";

export type PlanNodeDraft = {
  kind: PlanNodeKind;
  title: string;
  dayIndex: number;
  sortOrder: number;
};

export const PLAN_NODE_META: Record<
  PlanNodeKind,
  { title: string; blurb: string; setupLabel: string; voice: boolean }
> = {
  lesson: {
    title: "Giriş Dersi",
    blurb: "Kısa açılış dersi, yaklaşık 5 dk.",
    setupLabel: "Giriş Dersi",
    voice: false,
  },
  podcast: {
    title: "Podcast Dinle",
    blurb: "Konuyu sesli özetle dinle.",
    setupLabel: "Podcast",
    voice: false,
  },
  qa: {
    title: "AI öğretmenle Soru-Cevap",
    blurb: "Yapay zeka öğretmenle alıştırma.",
    setupLabel: "Soru-Cevap",
    voice: true,
  },
  quiz: {
    title: "Testler ve Doğru/Yanlış",
    blurb: "Çoktan seçmeli ve doğru/yanlış pratik.",
    setupLabel: "Testler",
    voice: false,
  },
  true_false: {
    title: "Doğru/Yanlış",
    blurb: "Kısa iddialarla hızlan.",
    setupLabel: "Doğru/Yanlış",
    voice: false,
  },
  oral: {
    title: "AI ile Sözlü Deneme",
    blurb: "Açık uçlu sözlü sorular.",
    setupLabel: "Sözlü",
    voice: true,
  },
  spaced: {
    title: "Aralıklı tekrar",
    blurb: "Öğrendiklerini tekrar et.",
    setupLabel: "Tekrar",
    voice: false,
  },
  gaps: {
    title: "Zayıf nokta",
    blurb: "Zayıf nokta tespiti ve odaklı pratik.",
    setupLabel: "Zayıf nokta",
    voice: false,
  },
  flashcards: {
    title: "Kartlarla son tekrar",
    blurb: "Sınav günü kısa kart turu.",
    setupLabel: "Kartlar",
    voice: false,
  },
  written_exam: {
    title: "Yazılı deneme",
    blurb: "Gerçek sınav simülasyonu, yapay zeka yardımı yok.",
    setupLabel: "Yazılı deneme",
    voice: false,
  },
};

/**
 * Çalışma yolu şablonu. PDF uzasa da türler değişmez; konu sayısı
 * belgenin kapsamından gelir, buradan değil.
 *
 * Sıra: açılış dersi → öğrenme ve pratik → tekrar → boşluk → yazılı
 * deneme → sınav günü kartları.
 */
export const CORE_ORDER: PlanNodeKind[] = [
  "lesson",
  "podcast",
  "qa",
  "quiz",
  "true_false",
  "oral",
  "spaced",
  "gaps",
  "written_exam",
  "flashcards",
];

export function daysUntilExam(examDate: string, from = new Date()): number {
  // Use the same Turkish calendar date on the UTC server and in the browser.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(from);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  const start = Date.parse(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
  const exam = Date.parse(`${examDate}T00:00:00Z`);
  const diff = Math.ceil((exam - start) / 86_400_000);
  return Math.max(1, diff);
}

export function buildExamPlan(days: number): PlanNodeDraft[] {
  const span = Math.max(1, Math.min(120, Math.floor(days)));
  // Gün sayısı düğüm türünü çoğaltmaz. Aynı şablon kısa ve uzun
  // hazırlıkta da durur; takvim yalnızca düğümün hangi güne düştüğünü söyler.
  return CORE_ORDER.map((kind, index) => ({
    kind,
    title: PLAN_NODE_META[kind].title,
    dayIndex:
      span >= CORE_ORDER.length
        ? Math.min(span, index + 1)
        : Math.min(span, Math.floor((index * span) / CORE_ORDER.length) + 1),
    sortOrder: index,
  }));
}

/**
 * Takvim yerleştirmesi bazı türleri (podcast, sözlü, kart) hiç
 * üretmezse şablondaki eksik türleri birer kez araya koyar.
 * Var olan düğümlerin sırası ve ek alanları durur.
 */
export function mergeStudyPathTemplate<T extends PlanNodeDraft>(nodes: T[]): T[] {
  const present = new Set(nodes.map((node) => node.kind));
  const out = [...nodes];
  for (const kind of CORE_ORDER) {
    if (present.has(kind)) continue;
    const slot = CORE_ORDER.indexOf(kind);
    const at = out.findIndex((node) => CORE_ORDER.indexOf(node.kind) > slot);
    const idx = at < 0 ? out.length : at;
    const anchor = out[Math.min(idx, Math.max(0, out.length - 1))];
    out.splice(idx, 0, {
      kind,
      title: PLAN_NODE_META[kind].title,
      dayIndex: anchor?.dayIndex ?? 1,
      sortOrder: 0,
    } as T);
  }
  return out.map((node, index) => ({ ...node, sortOrder: index }));
}

export function nodeProgress(nodes: { status: NodeStatus }[]) {
  const total = nodes.length;
  const done = nodes.filter((node) => node.status === "done").length;
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

/**
 * Ağırlıklı etkinlik ilerlemesi. Cevap doğruluğunu veya konu hakimiyetini
 * ölçmez; sınava hazır olma puanı olarak sunulmamalıdır.
 */
const READINESS_WEIGHT: Record<PlanNodeKind, number> = {
  written_exam: 4,
  oral: 3,
  quiz: 2,
  qa: 2,
  true_false: 2,
  gaps: 2,
  spaced: 1,
  flashcards: 1,
  // Ders ve podcast okuma/dinleme; bitirmek konuyu bildiğini göstermez.
  lesson: 1,
  podcast: 1,
};

export function readinessScore(
  nodes: { kind: PlanNodeKind; status: NodeStatus }[],
): number {
  let total = 0;
  let earned = 0;
  for (const node of nodes) {
    const weight = READINESS_WEIGHT[node.kind] ?? 1;
    total += weight;
    if (node.status === "done") earned += weight;
  }
  return total ? Math.round((earned / total) * 100) : 0;
}

/** Puanın karşılık geldiği kısa durum — geri sayım kartındaki etiket. */
export function readinessLabel(score: number): { emoji: string; text: string } {
  if (score >= 100) return { emoji: "✓", text: "Etkinlikler tamamlandı" };
  if (score >= 80) return { emoji: "↗", text: "Etkinliklerin çoğu tamamlandı" };
  if (score > 0) return { emoji: "↗", text: "Çalışmaya devam ediyorsun" };
  return { emoji: "○", text: "Henüz başlamadın" };
}

export function nextReadyNode<T extends { status: NodeStatus; sortOrder: number }>(
  nodes: T[],
) {
  return (
    nodes.find((node) => node.status === "ready") ??
    nodes.find((node) => node.status !== "done") ??
    null
  );
}
