import type { MockGradeItem } from "@/lib/learning/mock-exam";

/**
 * Yazılı deneme ↔ yoldaki "Yazılı deneme" düğümü (20 Ekim 2026). Saf parçalar: düğüm kaydının
 * içeriği ve bitmiş düğümün sonuç bağlantısı.
 */
export type MockNodePayload = {
  type: "mock_exam";
  practiceExamId: string;
  practiceAttemptId: string;
  items: { topic: string | null; verdict: MockGradeItem["verdict"]; correct: boolean }[];
};

export function mockNodePayload(input: {
  practiceExamId: string;
  practiceAttemptId: string;
  items: readonly Pick<MockGradeItem, "topicLabel" | "verdict">[];
}): MockNodePayload {
  return {
    type: "mock_exam",
    practiceExamId: input.practiceExamId,
    practiceAttemptId: input.practiceAttemptId,
    items: input.items.map((item) => ({
      topic: item.topicLabel?.trim() || null,
      verdict: item.verdict,
      correct: item.verdict === "dogru",
    })),
  };
}

/** Düğüm kaydının istek anahtarı: aynı notlandırma ikinci kez yazılmaz. */
export function mockNodeRequestId(practiceAttemptId: string): string {
  return `mock:${practiceAttemptId}`;
}

/**
 * Bitmiş yazılı deneme düğümü "72/100 Doğru cevaplar" kartı yerine denemenin soru incelemesini
 * açar. Kayıt deneme kaydı değilse null (sonuç sayfası kendi kartını çizer).
 */
export function mockReviewHref(prepId: string, kind: string, payload: unknown): string | null {
  if (kind !== "written_exam" || !payload || typeof payload !== "object") return null;
  const row = payload as { type?: unknown; practiceExamId?: unknown };
  if (row.type !== "mock_exam" || typeof row.practiceExamId !== "string" || !row.practiceExamId.trim()) return null;
  return `/deneme-sinavlari/${prepId}/deneme/${encodeURIComponent(row.practiceExamId)}/incele`;
}
