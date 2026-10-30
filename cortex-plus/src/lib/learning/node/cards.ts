/** Kartlar ve kartlarla tekrar: öğretmen kart motoru. */
import "server-only";
import { mergeDistinctCards, teacherCardsLoop } from "@/lib/learning/teacher-cards";
import { loadPreviousItems } from "@/lib/learning/previous-items";
import { runWithTeacherModel } from "@/lib/learning/teacher-engine-run";
import { sessionSignalsPrompt } from "@/lib/learning/session-signals";
import { teachingActivityForKind } from "@/lib/learning/teaching-standards";
import { NodeGenerationError, actionForKind } from "./shared";
import { teacherPages, type LessonCore } from "./teacher-pages";
import type { NodePayloadInput } from "./generate";

/**
 * Öğretmen kart motoru (2 Ekim 2026): hatırlatan ön yüz, kısa kesin arka yüz;
 * her kart belgeyle eşlenir, sorunlu kart düzeltilir ya da elenir. Kod kart
 * metnine dokunmaz.
 */
export async function teacherCardsPayload(
  input: NodePayloadInput,
  activity: ReturnType<typeof teachingActivityForKind>,
  core: LessonCore | null,
) {
  const startedAt = Date.now();
  // Kartlar yalnız konunun kendi sayfalarından (25 Ekim 2026, canlı test P1-2): yardımcı dosyanın
  // sayfası başka konunun kartını getiriyordu. Önceki destelerin kartları yeniden yazılmaz.
  const source = await teacherPages(input, core ? { ...core, support: [] } : core);
  const avoid =
    input.prepId && input.userId
      ? await loadPreviousItems(input.service, {
          userId: input.userId,
          prepId: input.prepId,
          kind: "cards",
          excludeNodeId: input.nodeId ?? null,
          topic: input.topicLabel,
          topicId: input.topicId ?? null,
        })
      : [];
  const cardsInput = {
    topicLabel: input.topicLabel,
    prepTitle: input.prepTitle,
    pages: source.pages,
    avoid,
    mode: core ? ("document" as const) : ("topic" as const),
    count: 8,
    focus: input.kind === "spaced" ? ("spaced" as const) : ("cards" as const),
    learnerLine: sessionSignalsPrompt(input.familiarity, input.mood),
    examPoints: input.examPoints,
    runningHeaders: source.edges,
    // Öğrenci bekliyor: kısa düzeltme bütçesi, paralel onarım (25 Ekim 2026).
    urgent: input.charge !== false,
  };
  const outcome = await runWithTeacherModel(input.service, {
    userId: input.userId,
    actionCode: actionForKind(input.kind),
    idempotencyKey: input.idempotencyKey ?? `cards:${input.prepId ?? "x"}:${input.topicLabel}:${Date.now()}`,
    freeMeter: input.freeMeter,
    charge: input.charge,
    startedAt,
    label: "teacher_cards",
    topic: input.topicLabel,
    work: async (ask, started) => {
      let cards = (await teacherCardsLoop(ask, cardsInput, started)).cards;
      let rejected = 0;
      let tries = 1;
      while (cards.length < cardsInput.count && tries < 4) {
        tries += 1;
        const again = await teacherCardsLoop(ask, { ...cardsInput, count: cardsInput.count - cards.length + 1 }, started);
        rejected += again.rejected.length;
        // Ek turun kartı destedekiyle aynı bilgiyi taşıyorsa alınmaz (30 Ekim 2026).
        cards = mergeDistinctCards(cards, again.cards, cardsInput.count);
      }
      const log = { kept: cards.length, rejected, rounds: tries };
      return cards.length
        ? { ok: true as const, result: cards.slice(0, cardsInput.count), log }
        : { ok: false as const, reasons: ["short"], log };
    },
  });
  if (!outcome.ok) {
    throw new NodeGenerationError(outcome.status, outcome.error, outcome.reasons);
  }
  return { type: "cards", cards: outcome.result, teachingStandard: activity, masteryClaim: false, engine: "teacher" };
}
