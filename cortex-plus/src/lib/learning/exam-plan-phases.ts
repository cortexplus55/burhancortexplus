import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

/**
 * Çalışma yolunun görünen iskeleti. Aktivite türleri belgenin
 * uzunluğundan bağımsızdır; konu sayısı ayrıdır (`Planın N`).
 * Türü olmayan satırlar (tanı, hazır) mevcut ekranlara bağlanır,
 * yeni bir düğüm türü açmaz.
 */
export type PathSkeletonItem = {
  label: string;
  hint?: string;
  kind?: PlanNodeKind;
};

export type PathSkeletonPhase = {
  title: string;
  items: PathSkeletonItem[];
};

export const STUDY_PATH_SKELETON: PathSkeletonPhase[] = [
  {
    title: "Bugün başla",
    items: [
      { label: "Yapay zeka ile Çalışma Yolu" },
      { label: "Giriş Dersi", hint: "5 dk", kind: "lesson" },
      { label: "Tanı Testi" },
    ],
  },
  {
    title: "Öğren ve Pratik Yap",
    items: [
      { label: "Podcast Dinle", kind: "podcast" },
      { label: "AI öğretmenle Soru-Cevap", kind: "qa" },
      { label: "Testler ve Doğru/Yanlış", kind: "quiz" },
      { label: "AI ile Sözlü Deneme", kind: "oral" },
    ],
  },
  {
    title: "Aralıklı Tekrar",
    items: [{ label: "Öğrendiklerini tekrar et", kind: "spaced" }],
  },
  {
    title: "Bilgi boşluklarını kapat",
    items: [
      { label: "Zayıf nokta", kind: "gaps" },
      { label: "Odaklı pratik", kind: "focused" },
    ],
  },
  {
    title: "Yazılı Deneme",
    items: [
      {
        label: "Yazılı deneme",
        hint: "Yapay zeka yardımı yok",
        kind: "written_exam",
      },
    ],
  },
  {
    title: "Sınav günü",
    items: [
      { label: "Kartlarla son tekrar", kind: "flashcards" },
      { label: "Son kontrol", kind: "final_check" },
      { label: "Hazırsın", kind: "readiness" },
    ],
  },
];

/**
 * Çalışma yolunu öğrencinin okuyabileceği aşamalara böler.
 *
 * Düz bir "Gün 1, Gün 2…" listesi planın neden bu sırada olduğunu anlatmıyor.
 * Aşamalar aynı düğümleri "önce tanı, sonra öğren, sonra boşluk kapat, en son
 * deneme" hikâyesine oturtuyor; öğrenci sınava kadar ne olacağını tek bakışta
 * görüyor.
 */

export type PhaseId =
  | "start"
  | "learn"
  | "review"
  | "gaps"
  | "mock"
  | "exam_day";

export type PhaseMeta = {
  id: PhaseId;
  title: string;
  blurb: string;
  kinds: PlanNodeKind[];
};

export const PLAN_PHASES: PhaseMeta[] = [
  {
    id: "start",
    title: "Bugün başla",
    blurb: "Çalışma yolu, giriş dersi ve tanı testi.",
    kinds: [],
  },
  {
    id: "learn",
    title: "Öğren ve Pratik Yap",
    blurb: "Podcast, soru-cevap, test ve sözlü deneme.",
    kinds: ["lesson", "podcast", "qa", "quiz", "true_false", "oral"],
  },
  {
    id: "review",
    title: "Aralıklı Tekrar",
    blurb: "Öğrendiklerini tekrar et.",
    kinds: ["spaced"],
  },
  {
    id: "gaps",
    title: "Bilgi boşluklarını kapat",
    blurb: "Zayıf nokta tespiti, sonra odaklı pratik.",
    kinds: ["gaps", "focused"],
  },
  {
    id: "mock",
    title: "Yazılı Deneme",
    blurb: "Gerçek sınav simülasyonu, yapay zeka yardımı yok.",
    kinds: ["written_exam"],
  },
  {
    id: "exam_day",
    title: "Sınav günü",
    blurb: "Kartlar, son kontrol, sonra kayıtlı verilere göre hazırlık.",
    kinds: ["flashcards", "final_check", "readiness"],
  },
];

const PHASE_BY_KIND = new Map<PlanNodeKind, PhaseId>();
for (const phase of PLAN_PHASES) {
  for (const kind of phase.kinds) PHASE_BY_KIND.set(kind, phase.id);
}

export function phaseForKind(kind: PlanNodeKind): PhaseId {
  return PHASE_BY_KIND.get(kind) ?? "learn";
}

/**
 * Aşama sırasını koruyarak düğümleri gruplar. Boş aşama döndürülmez —
 * kısa planlarda (ör. 3 gün) bazı aşamalar hiç oluşmaz.
 */
export function groupNodesByPhase<T extends { kind: PlanNodeKind }>(
  nodes: T[],
): { phase: PhaseMeta; nodes: T[] }[] {
  const buckets = new Map<PhaseId, T[]>();
  let introPlaced = false;
  for (const node of nodes) {
    // Giriş dersi "Bugün başla"nın altında durur. Sonraki ders düğümleri
    // öğrenme aşamasında kalır; takvim sırası fazın içinde korunur.
    let id = phaseForKind(node.kind);
    if (node.kind === "lesson" && !introPlaced) {
      id = "start";
      introPlaced = true;
    }
    buckets.set(id, [...(buckets.get(id) ?? []), node]);
  }
  return PLAN_PHASES.map((phase) => ({
    phase,
    nodes: buckets.get(phase.id) ?? [],
  })).filter((group) => group.nodes.length > 0);
}

/**
 * Sınava kadar beklenen hazırlık puanı. Bugünkü puandan hedefe doğrusal
 * ilerlemez — planın ilk yarısı öğrenme, ikinci yarısı pekiştirme olduğu için
 * eğri sona doğru yataylaşır. Tahmindir; söz değil.
 */
export function projectedReadiness(
  todayScore: number,
  targetScore: number,
  daysLeft: number,
): number {
  if (daysLeft <= 0) return todayScore;
  const room = Math.max(0, targetScore - todayScore);
  // 7 günde ~%75'i, 20 günde ~%95'i kapanır.
  const reach = 1 - Math.exp(-daysLeft / 5);
  return Math.round(Math.min(targetScore, todayScore + room * reach));
}
