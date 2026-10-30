/** Doğru/yanlış: öğretmen doğru/yanlış motoru. */
import "server-only";
import { loadPreviousItems } from "@/lib/learning/previous-items";
import { teacherTrueFalseLoop } from "@/lib/learning/teacher-practice";
import { sameTrueFalseFact } from "@/lib/learning/true-false-quality";
import { runWithTeacherModel } from "@/lib/learning/teacher-engine-run";
import { sessionSignalsPrompt } from "@/lib/learning/session-signals";
import { dropNearDuplicatesKeepingCount } from "@/lib/learning/item-dedup";
import { teachingActivityForKind } from "@/lib/learning/teaching-standards";
import { NodeGenerationError, actionForKind } from "./shared";
import { teacherPages, type LessonCore } from "./teacher-pages";
import type { NodePayloadInput } from "./generate";

/** Öğretmen doğru/yanlış motoru (2 Ekim 2026): her önerme belgeyle eşlenir. */
export async function teacherTrueFalsePayload(
  input: NodePayloadInput,
  activity: ReturnType<typeof teachingActivityForKind>,
  core: LessonCore | null,
) {
  const startedAt = Date.now();
  const source = await teacherPages(input, core);
  // Bu konuda önceki etkinliklerin sorduğu bilgiler (Paket I #8): yazara yasak listesi, sonra aynı bilgiyi
  // soran önerme yerine yenisi varsa elenir (sayı eksilmez).
  const avoid =
    input.prepId && input.userId
      ? await loadPreviousItems(input.service, {
          userId: input.userId,
          prepId: input.prepId,
          kind: "true_false",
          excludeNodeId: input.nodeId ?? null,
          topic: input.topicLabel,
          topicId: input.topicId ?? null,
        })
      : [];
  const outcome = await runWithTeacherModel(input.service, {
    userId: input.userId,
    actionCode: actionForKind(input.kind),
    idempotencyKey: input.idempotencyKey ?? `tf:${input.prepId ?? "x"}:${input.topicLabel}:${Date.now()}`,
    freeMeter: input.freeMeter,
    charge: input.charge,
    startedAt,
    label: "teacher_true_false",
    topic: input.topicLabel,
    work: async (ask, started) => {
      const asked = 8;
      const tfInput = {
        topicLabel: input.topicLabel,
        prepTitle: input.prepTitle,
        pages: source.pages,
        mode: core ? ("document" as const) : ("topic" as const),
        learnerLine: sessionSignalsPrompt(input.familiarity, input.mood),
        examPoints: input.examPoints,
        examPointsUse: "true_false" as const,
        count: asked,
        urgent: input.charge !== false,
        avoid,
      };
      const loop = await teacherTrueFalseLoop(ask, tfInput, started);
      let items = loop.items;
      let tries = 1;
      const mixedOf = (rows: typeof items) => rows.some((item) => item.correct) && rows.some((item) => !item.correct);
      while ((items.length < asked || !mixedOf(items)) && tries < 4) {
        tries += 1;
        const again = await teacherTrueFalseLoop(ask, { ...tfInput, count: Math.max(1, asked - items.length + 1) }, started);
        // Ek turun önermesi setteki bir önermenin çifti ya da tersiyse alınmaz (28 Ekim 2026).
        for (const item of again.items) {
          if (items.length >= asked || items.some((other) => sameTrueFalseFact(item, other))) continue;
          items = [...items, item];
        }
      }
      // Önceki etkinliğin aynı bilgisini soran önerme, yerine sağlam önerme varsa çıkar (sayı eksilmez).
      const fresh = dropNearDuplicatesKeepingCount(items, (item) => item.text, asked, avoid);
      if (mixedOf(fresh)) items = fresh;
      const mixed = mixedOf(items);
      const log = { kept: items.length, rejected: loop.rejected.length, rounds: tries, mixed };
      return items.length >= asked && mixed
        ? { ok: true as const, result: items.slice(0, asked), log }
        : { ok: false as const, reasons: loop.rejected.slice(0, 4).map((row) => row.problems[0] ?? "sorun"), log };
    },
  });
  if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error, outcome.reasons);
  return { type: "true_false", items: outcome.result, teachingStandard: activity, engine: "teacher" };
}
