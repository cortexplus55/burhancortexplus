export type PlanNodeKind =
  | "lesson"
  | "podcast"
  | "qa"
  | "quiz"
  | "true_false"
  | "oral"
  | "spaced"
  | "gaps"
  | "focused"
  | "flashcards"
  | "written_exam"
  | "final_check"
  | "readiness";

export type NodeStatus = "locked" | "ready" | "done";

/**
 * exam_prep_nodes.session_meta. Takvim kurucusunun yazdığı alanlar;
 * yeni bir anahtar eklenmez.
 */
export type PlanNodeSessionMeta = {
  topicId?: string;
  topicTitle?: string;
  objective?: string;
  sourcePages?: number[];
  durationMinutes?: number;
  role?: "learn" | "practice" | "review" | "mock";
  calendarDate?: string;
};

export type PlanNodeDraft = {
  kind: PlanNodeKind;
  title: string;
  dayIndex: number;
  sortOrder: number;
  meta?: PlanNodeSessionMeta;
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
    blurb: "Zayıf nokta tespiti.",
    setupLabel: "Zayıf nokta",
    voice: false,
  },
  focused: {
    title: "Odaklı pratik",
    blurb: "Yanlışların ve zayıf konuların kayıtlı soruları.",
    setupLabel: "Odaklı pratik",
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
  final_check: {
    title: "Son kontrol",
    blurb: "Sınav günü kısa kontrol. Yeni konu üretilmez.",
    setupLabel: "Son kontrol",
    voice: false,
  },
  readiness: {
    title: "Hazırsın?",
    blurb: "Eksikler bu ekranda · ~3 dk.",
    setupLabel: "Hazırlık durumu",
    voice: false,
  },
};

/**
 * Çalışma yolu şablonu. PDF uzasa da türler değişmez; konu sayısı
 * belgenin kapsamından gelir, buradan değil.
 *
 * Sıra: açılış dersi → öğrenme ve pratik → tekrar → boşluk → odaklı
 * pratik → yazılı deneme → sınav günü kartları, son kontrol, hazırlık.
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
  "focused",
  "written_exam",
  "flashcards",
  "final_check",
  "readiness",
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
 * Yanındaki gerçek düğümün oturum metası. Konu, hedef, sayfa ve
 * calendarDate oradan gelir; sayfa listesi kopyalanır ki iki düğüm
 * aynı diziyi paylaşmasın.
 */
function sessionMetaFromAnchor(
  anchor: PlanNodeDraft | undefined,
): PlanNodeSessionMeta | undefined {
  const meta = anchor?.meta;
  if (!meta) return undefined;
  const copy: PlanNodeSessionMeta = { ...meta };
  if (meta.sourcePages) copy.sourcePages = [...meta.sourcePages];
  return copy;
}

const TOPIC_TIED_KINDS = new Set<PlanNodeKind>([
  "lesson",
  "podcast",
  "qa",
  "quiz",
  "true_false",
  "oral",
  "spaced",
]);

const PREP_WIDE_KINDS = new Set<PlanNodeKind>([
  "gaps",
  "focused",
  "written_exam",
  "flashcards",
  "final_check",
  "readiness",
]);

/** Şablon düğümünün başlığı konuyu ya da hazırlığın bütününü söyler. */
export function studyPathItemTitle(
  kind: PlanNodeKind,
  meta?: PlanNodeSessionMeta,
): string {
  const base = PLAN_NODE_META[kind].title;
  const topic = meta?.topicTitle?.trim();
  if (topic && TOPIC_TIED_KINDS.has(kind)) return `${topic} · ${base}`;
  if (PREP_WIDE_KINDS.has(kind)) return `${base} · Tüm konular`;
  return base;
}

/**
 * Takvim yerleştirmesi bazı türleri (podcast, sözlü, kart) hiç
 * üretmezse şablondaki eksik türleri birer kez araya koyar.
 * Var olan düğümlerin sırası ve ek alanları durur. Eklenen düğüm,
 * durduğu yerdeki komşunun session_meta şeklini alır; aksi halde
 * oluşturma bu düğümü atlar ve bitince takvim değişimi
 * schedule_metadata_missing verir.
 *
 * `alreadyPresent`: yeniden kurulumda korunmuş (bitmiş) türler.
 * Onlar listede yoktur ama bir kez daha eklenmez.
 */
export function mergeStudyPathTemplate<T extends PlanNodeDraft>(
  nodes: T[],
  options?: { alreadyPresent?: Iterable<PlanNodeKind> },
): T[] {
  const present = new Set<PlanNodeKind>(options?.alreadyPresent ?? []);
  for (const node of nodes) present.add(node.kind);
  const out = [...nodes];
  for (const kind of CORE_ORDER) {
    if (present.has(kind)) continue;
    // Test zaten doğru/yanlış içerir. Aynı konu için ikinci bir
    // "Doğru/Yanlış" düğümü aynı işi bir daha yazar.
    if (kind === "true_false" && present.has("quiz")) continue;
    const slot = CORE_ORDER.indexOf(kind);
    const at = out.findIndex((node) => CORE_ORDER.indexOf(node.kind) > slot);
    const idx = at < 0 ? out.length : at;
    const anchor = out[Math.min(idx, Math.max(0, out.length - 1))];
    const meta = sessionMetaFromAnchor(anchor);
    out.splice(idx, 0, {
      kind,
      title: studyPathItemTitle(kind, meta),
      dayIndex: anchor?.dayIndex ?? 1,
      sortOrder: 0,
      ...(meta ? { meta } : {}),
    } as T);
  }
  return out.map((node, index) => ({ ...node, sortOrder: index }));
}

/**
 * Oluşturma, her taslağın metasını exam_prep_nodes.session_meta olarak
 * yazar. Metası olmayan düğüm atlanır — şablon düğümleri bu yüzden
 * komşunun metasını taşımak zorunda.
 */
export function sessionMetaBySortOrder(
  drafts: PlanNodeDraft[],
): Map<number, PlanNodeSessionMeta> {
  const bySort = new Map<number, PlanNodeSessionMeta>();
  for (const draft of drafts) {
    if (!draft.meta) continue;
    bySort.set(draft.sortOrder, draft.meta);
  }
  return bySort;
}

/**
 * Takvim yeniden kurulunca yazılacak düğümler. Oturum taslakları
 * şablon türleriyle tamamlanır. `sortFloor` korunmuş düğümlerin
 * sort_order değerinin üstüdür; yeni satırlar onların sırasına girmez.
 * Korunacak düğüm yoksa şablonun kendi 0..n sırası durur.
 */
export function withTemplateFillers<T extends PlanNodeDraft>(
  nodes: T[],
  options?: { alreadyPresent?: Iterable<PlanNodeKind>; sortFloor?: number },
): T[] {
  if (!nodes.length) return nodes;
  const merged = mergeStudyPathTemplate(nodes, {
    alreadyPresent: options?.alreadyPresent,
  });
  const floor = options?.sortFloor ?? 0;
  if (floor <= 0) return merged;
  return merged.map((node, index) => ({ ...node, sortOrder: floor + index }));
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
  focused: 2,
  final_check: 2,
  spaced: 1,
  flashcards: 1,
  readiness: 1,
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
