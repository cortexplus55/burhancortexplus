/**
 * Sonuç ekranı sonraki adımları — konu karnesinden deterministik.
 * Model uydurmaz.
 */

import type { MockTopicReportRow } from "@/lib/learning/mock-exam/types";
import { polishMockCopy } from "@/lib/learning/mock-exam/labels";

export type MockNextStep = {
  label: string;
  href: string;
  kind: "lesson" | "mistakes" | "flashcards" | "readiness";
};

export function buildNextSteps(input: {
  prepId: string;
  report: MockTopicReportRow[];
  wrongCount: number;
  nodes?: Array<{ kind: string; topicLabel?: string | null; id: string; href?: string }>;
}): MockNextStep[] {
  const steps: MockNextStep[] = [];
  const weakest = input.report[0];
  if (weakest && weakest.percent < 80) {
    const lesson = input.nodes?.find(
      (n) =>
        n.kind === "lesson" &&
        n.topicLabel &&
        fold(n.topicLabel) === fold(weakest.topicLabel),
    );
    steps.push({
      kind: "lesson",
      label: polishMockCopy(`${weakest.topicLabel} dersini tekrarla`),
      href: lesson?.href ?? `/deneme-sinavlari/${input.prepId}`,
    });
  }
  if (input.wrongCount > 0) {
    steps.push({
      kind: "mistakes",
      label: polishMockCopy(
        input.wrongCount === 1
          ? "1 yanlışını tekrar et"
          : `${input.wrongCount} yanlışını tekrar et`,
      ),
      href: "/yanlislarim",
    });
  }
  if (weakest && weakest.percent < 70) {
    const cards = input.nodes?.find(
      (n) =>
        (n.kind === "flashcards" || n.kind === "cards") &&
        n.topicLabel &&
        fold(n.topicLabel) === fold(weakest.topicLabel),
    );
    steps.push({
      kind: "flashcards",
      label: polishMockCopy(`${weakest.topicLabel} kartlarını çalış`),
      href: cards?.href ?? `/deneme-sinavlari/${input.prepId}`,
    });
  }
  return steps.slice(0, 3);
}

function fold(s: string) {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
