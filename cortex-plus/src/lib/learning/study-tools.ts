import type { NodeStatus, PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { examPrepNodeHref, examPrepPodcastHref } from "@/lib/learning/exam-prep-hrefs";

/**
 * Çalışma yolu bir öneridir. Kilit, önceki adım bitmeden sonrakini
 * yasaklamaz. Kredi ve plan sınırı burada değil; düğüm üretilirken
 * durur.
 */

export const STUDY_PATH_HINT =
  "Önerilen sıra. İstediğin etkinliği istediğin zaman açabilirsin.";

export type StudyToolId =
  | "lesson"
  | "podcast"
  | "oral"
  | "written_exam"
  | "quiz"
  | "flashcards"
  | "qa";

export type StudyTool = {
  id: StudyToolId;
  kind: PlanNodeKind;
  title: string;
  blurb: string;
};

export const STUDY_TOOLS: StudyTool[] = [
  { id: "lesson", kind: "lesson", title: "Konu anlatımı", blurb: "Kısa ders" },
  { id: "podcast", kind: "podcast", title: "Podcast", blurb: "Sesli anlatım" },
  { id: "oral", kind: "oral", title: "Sözlü deneme", blurb: "Konuş veya yaz" },
  { id: "written_exam", kind: "written_exam", title: "Yazılı deneme", blurb: "Süre var, yardım yok" },
  { id: "quiz", kind: "quiz", title: "Test", blurb: "Çoktan seçmeli" },
  { id: "flashcards", kind: "flashcards", title: "Kartlar", blurb: "Kısa tekrar" },
  { id: "qa", kind: "qa", title: "AI öğretmen", blurb: "Soru-cevap" },
];

export function studyToolById(id: StudyToolId): StudyTool {
  return STUDY_TOOLS.find((tool) => tool.id === id) ?? STUDY_TOOLS[0];
}

/** Sıra kilidi açık düğümü kapatmaz. Bilinmeyen durum kapalı kalır. */
export function studyNodeOpenable(status: string | null | undefined): boolean {
  return status === "locked" || status === "ready" || status === "done";
}

export function studyNodeAria(status: NodeStatus | string): string {
  if (status === "done") return "tamamlandı";
  if (status === "locked") return "önerilen sırada";
  return "sırada";
}

export type StudyNodeRef = {
  id: string;
  kind: string;
  sortOrder: number;
  status: string;
  sessionMeta?: { topicId?: string | null; topicTitle?: string | null } | null;
};

function fold(text: string | null | undefined): string {
  return (text ?? "").trim().toLocaleLowerCase("tr-TR");
}

/**
 * Seçilen konuda bu etkinliğin düğümü.
 * Başka konunun düğümüne düşmez: yanlış ders açmak, kapalı düğümden kötüdür.
 * Konu seçilmemişse o türün bitmemiş ilk düğümü gelir.
 */
export function resolveStudyToolNode<T extends StudyNodeRef>(
  nodes: T[],
  tool: StudyToolId,
  topic?: { id?: string | null; label?: string | null },
): T | null {
  const kind = studyToolById(tool).kind;
  const pool = nodes
    .filter((node) => node.kind === kind)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (!pool.length) return null;
  const topicId = topic?.id?.trim();
  const label = fold(topic?.label);
  if (!topicId && !label) {
    return pool.find((node) => node.status !== "done") ?? pool[0];
  }
  const mine = pool.filter((node) => {
    const metaId = node.sessionMeta?.topicId?.trim();
    if (topicId && metaId && metaId === topicId) return true;
    return label ? fold(node.sessionMeta?.topicTitle) === label : false;
  });
  if (!mine.length) return null;
  return mine.find((node) => node.status !== "done") ?? mine[0];
}

export function studyToolHref(prepId: string, nodeId: string): string {
  return examPrepNodeHref(prepId, nodeId);
}

/**
 * Podcast karosu yoldaki düğümü açmaz. Konu ve süre seçici
 * `/deneme-sinavlari/[prepId]/podcast` rotasındadır.
 * Konu kimliği hazırlığın konu kaydıysa sorguya yazılır; etiket
 * eşleşmezse seçici açılır.
 */
export function studyPodcastHref(
  prepId: string,
  topicLabel: string | null,
  topics: { id: string; label: string }[] = [],
): string {
  const wanted = (topicLabel ?? "").trim().toLocaleLowerCase("tr-TR");
  const match = wanted
    ? topics.find((topic) => topic.label.trim().toLocaleLowerCase("tr-TR") === wanted && topic.id.trim())
    : undefined;
  return examPrepPodcastHref(prepId, match?.id);
}

/**
 * Zayıf konudaki pratik düğümü. Quiz, yoksa odaklı pratik, yoksa ders.
 * Konu eşleşmezse bağlantı hazırlığın kendisine döner.
 */
export function pickPracticeNodeId(
  nodes: StudyNodeRef[],
  topicLabel: string | null | undefined,
): string | null {
  const label = fold(topicLabel);
  if (!label) return null;
  const ranked: PlanNodeKind[] = ["quiz", "focused", "lesson"];
  for (const kind of ranked) {
    const hit = nodes.find((node) => {
      if (node.kind !== kind) return false;
      return fold(node.sessionMeta?.topicTitle) === label;
    });
    if (hit) return hit.id;
  }
  return null;
}

export function practiceHref(prepId: string, nodeId: string | null): string {
  return nodeId ? examPrepNodeHref(prepId, nodeId) : `/deneme-sinavlari/${prepId}`;
}
