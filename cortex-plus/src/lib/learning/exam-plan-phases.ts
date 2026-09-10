import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

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
    blurb: "Seviyeni ölçüyoruz, yolun buna göre kuruluyor.",
    kinds: [],
  },
  {
    id: "learn",
    title: "Öğren ve pratik yap",
    blurb: "Konuyu dinle, anlat, çöz.",
    kinds: ["podcast", "qa", "quiz", "true_false", "oral"],
  },
  {
    id: "review",
    title: "Aralıklı tekrar",
    blurb: "Öğrendiğin unutulmadan geri gelir.",
    kinds: ["spaced"],
  },
  {
    id: "gaps",
    title: "Eksiklerini kapat",
    blurb: "Yanlışlarının toplandığı yere odaklanırsın.",
    kinds: ["gaps"],
  },
  {
    id: "mock",
    title: "Deneme sınavı",
    blurb: "Gerçek sınav koşulları, yapay zekâ yardımı kapalı.",
    kinds: ["written_exam"],
  },
  {
    id: "exam_day",
    title: "Sınav günü",
    blurb: "Kısa kartlarla son tur.",
    kinds: ["flashcards"],
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
  for (const node of nodes) {
    const id = phaseForKind(node.kind);
    buckets.set(id, [...(buckets.get(id) ?? []), node]);
  }
  return PLAN_PHASES.map((phase) => ({
    phase,
    nodes: buckets.get(phase.id) ?? [],
  })).filter((group) => group.phase.id === "start" || group.nodes.length > 0);
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
