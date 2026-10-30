/**
 * Hazırlığın ölçüleri TEK yerden (30 Ekim 2026, Paket I #7).
 *
 * Canlıda aynı ekranda birbirini tutmayan sayılar vardı: "Hazırlık %4" ile "Program ilerlemesi %3", "45 ders"
 * ile "20 ders", emek verdikçe düşen "hazırlık". Üç ayrı formül aynı ada yazılıyordu: düğüm oranı
 * (`nodeProgress`), ağırlıklı etkinlik puanı (`readinessScore`) ve ölçülen hazırlık. Şimdi her ölçünün tek
 * işlevi ve tek adı var; ekranlar yalnız buradan okur:
 *
 * | Ad | Ne | Davranış |
 * |---|---|---|
 * | Tamamlama | biten adım / yolun adımları ("Hazırsın" karar ekranı sayılmaz) | etkinlik bittikçe artar, yanlış cevapla düşmez |
 * | Hazırlık | ölçülen başarı tahmini (`computeExamReadiness`) | yanlış cevapla düşebilir |
 * | Konu hâkimiyeti | ölçülen konuların başarısı, "x/N konu ölçüldü" kapsamıyla | ölçülmemiş konu sayı değil "Ölçülmedi" |
 * | Ders | biten ders adımı (yalnız `lesson`; 30 Ekim 2026'dan beri odaklı pratik, zayıf nokta ve kartlarla tekrar ders sayılmaz) | "Hazırsın" ekranı ders değildir |
 *
 * Yaprak modül: yalnız tür içe aktarır (learning-tracking ve prep-progress-view bunu okur; döngü yok).
 */

import type { NodeStatus, PlanNodeKind } from "@/lib/learning/exam-prep-plan";

export const METRIC_LABEL = {
  completion: "Tamamlama",
  readiness: "Hazırlık",
  mastery: "Konu hâkimiyeti",
  lessons: "ders",
} as const;

export const METRIC_HINT = {
  completion: "Biten adımlar. Etkinlik bittikçe artar; yanlış cevapla düşmez.",
  readiness: "Ölçülen başarı tahmini. Yanlış cevapla düşebilir.",
  mastery: "Yalnız ölçülen konuların başarısı.",
} as const;

/** "Hazırsın" bir karar ekranı: açılınca düğüm biter ama tamamlanan etkinlik ya da ders sayılmaz. */
export const COMPLETION_EXCLUDED_KINDS: ReadonlySet<PlanNodeKind> = new Set<PlanNodeKind>(["readiness"]);

/**
 * Ders sayılan adımlar: yalnız ders düğümü (30 Ekim 2026). Canlı tur: tek ders bitmişken "Kartlarla tekrar" da ders
 * sayıldı, hazırlık sayfası "2 ders tamamlandı", İlerleme "Bugün 2 ders" yazdı. İlerleme sekmesinin tempo ve tahmin
 * hesabı da bunu sayar ("N ders daha" aynı birimle).
 */
export const LESSON_KINDS: ReadonlySet<PlanNodeKind> = new Set<PlanNodeKind>(["lesson"]);

type StepLike = { status: NodeStatus; kind?: PlanNodeKind | string | null };

function counted(node: StepLike): boolean {
  return !node.kind || !COMPLETION_EXCLUDED_KINDS.has(node.kind as PlanNodeKind);
}

/** Tamamlama: biten adım / yolun adımları. */
export function pathCompletion(nodes: readonly StepLike[]): { done: number; total: number; pct: number } {
  const steps = nodes.filter(counted);
  const done = steps.filter((node) => node.status === "done").length;
  const total = steps.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Biten ders sayısı (hero "N ders tamamlandı" ve İlerleme'nin "ders" kutusu aynı sayı). */
export function lessonsCompleted(nodes: readonly StepLike[]): number {
  return nodes.filter((node) => node.status === "done" && LESSON_KINDS.has(node.kind as PlanNodeKind)).length;
}

/** "3/22 konu ölçüldü". */
export function coverageLine(measured: number, total: number): string {
  return `${measured}/${total} konu ölçüldü`;
}

/** Konu yüzdesinin yazısı: ölçülmemişse sayı yazılmaz. */
export function masteryPercentText(percent: number | null | undefined, measured: boolean): string {
  if (!measured || percent == null || !Number.isFinite(percent)) return "Ölçülmedi";
  return `%${Math.max(0, Math.min(100, Math.round(percent)))}`;
}
