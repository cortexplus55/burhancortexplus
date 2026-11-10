import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { runWithTeacherModel } from "@/lib/learning/teacher-engine-run";
import { teacherTrueFalseLoop, type TrueFalseItem } from "@/lib/learning/teacher-practice";
import { sameTrueFalseFact } from "@/lib/learning/true-false-quality";
import { studioTeacherSource } from "@/lib/learning/studio-teacher-source";

export const maxDuration = 300;

function takeMixed(items: TrueFalseItem[], count: number): TrueFalseItem[] | null {
  if (items.length < count) return null;
  const yes = items.filter((item) => item.correct);
  const no = items.filter((item) => !item.correct);
  if (!yes.length || !no.length) return null;
  const picked: TrueFalseItem[] = [yes[0]!, no[0]!];
  for (const item of items) {
    if (picked.length >= count) break;
    if (picked.includes(item)) continue;
    picked.push(item);
  }
  return picked.length === count ? picked : null;
}

/** Ek turların süre bütçesi: bu süreden sonra yeni tur başlamaz, eldeki set teslim edilir. */
const TF_EXTRA_ROUND_BUDGET_MS = 75_000;

/** Eksik teslimin tabanı: istenenin yarısı, en az dört önerme. */
function trueFalseFloor(count: number): number {
  return Math.max(4, Math.ceil(count / 2));
}

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  /** Öğrenci 8 / 12 / 16 seçer (19 Ekim 2026; önce hep 8). */
  count: z.number().int().min(4).max(20).default(8),
  /** "Belgem": önermeler yalnızca bu belgeden. */
  documentId: z.string().uuid().optional(),
});

/**
 * Araçlar > Doğru / Yanlış. 19 Ekim 2026'ya kadar tek seferlik bir taslaktı: denetim yoktu, belge
 * seçilemiyordu, önermeler "etkileyebilir / olabilir" diye kaçamak çıkıyordu (canlıda Kavram
 * turu). Artık hazırlık yolundaki öğretmen motoru: her önermeyi kendisi değerlendiren denetim,
 * sorunlu önermenin düzeltilmesi ya da elenmesi; belge seçildiyse yalnızca o belgeden.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "true-false", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { count, documentId } = parsedBody.data;
  const topic = parsedBody.data.topic.trim();

  // Kredi ayrılmadan önce: belge hazır değilse net sebep, kayıp yok.
  const source = await studioTeacherSource(service, { userId, topic, documentId });
  if (!source) return errorResponse(409, "document_not_ready");

  const outcome = await runWithTeacherModel(service, {
    userId,
    actionCode: "QUIZ_GENERATE",
    idempotencyKey: `studio-tf:${userId}:${crypto.randomUUID()}`,
    label: "studio_true_false",
    topic,
    work: async (ask, started) => {
      const run = (want: number) => teacherTrueFalseLoop(
        ask,
        { topicLabel: topic, prepTitle: source.fileName ?? topic, pages: source.pages, mode: source.mode, count: want },
        started,
      );
      const loop = await run(count);
      let items: TrueFalseItem[] = loop.items;
      let tries = 1;
      const mixed = (list: TrueFalseItem[]) => list.some((item) => item.correct) && list.some((item) => !item.correct);
      // Ek tur ancak öğrenciyi makul süre bekletecekse (10 Kasım 2026): ücretsiz hesapta her tur normal hızda
      // koşar; dört tur üst üste öğrenciyi dakikalarca "hazırlanıyor"da tutuyordu.
      while ((items.length < count || !mixed(items)) && tries < 4 && Date.now() - started < TF_EXTRA_ROUND_BUDGET_MS) {
        tries += 1;
        const extra = await run(Math.max(1, count - items.length + 1)).catch(() => null);
        // Ek turun önermesi setteki bir önermenin çifti ya da tersiyse alınmaz (28 Ekim 2026).
        for (const item of extra?.items ?? []) {
          if (items.some((other) => sameTrueFalseFact(item, other))) continue;
          items = [...items, item];
        }
      }
      // İstek düşmez (19 Ekim 2026): sayı dolmadıysa eldeki karışık set teslim edilir (en az yarısı ve dört önerme).
      const partial = Math.min(items.length, count);
      const delivered = takeMixed(items, count) ?? (partial >= trueFalseFloor(count) ? takeMixed(items, partial) : null);
      const log = { kept: delivered?.length ?? items.length, rejected: loop.rejected.length, rounds: loop.rounds, mixed: Boolean(delivered), tries };
      return delivered
        ? { ok: true as const, result: delivered, log }
        : { ok: false as const, reasons: loop.rejected.slice(0, 4).map((row) => row.problems[0] ?? "sorun"), log };
    },
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const title = topic;
  const { data: quiz } = await service
    .from("quizzes")
    .insert({ user_id: userId, title, ...(documentId ? { document_id: documentId } : {}) })
    .select("id")
    .single();

  if (quiz) {
    await service.from("quiz_questions").insert(
      outcome.result.map((item, index) => ({
        quiz_id: quiz.id,
        question_text: item.text,
        options: ["Doğru", "Yanlış"],
        correct_answer: item.correct ? "Doğru" : "Yanlış",
        explanation: item.explanation || null,
        sort_order: index,
      })),
    );
  }

  return NextResponse.json({
    quizId: quiz?.id ?? null,
    title,
    requested: count,
    source: documentId
      ? { kind: "document", documentId, fileName: source.fileName, wholeDocument: source.wholeDocument, matched: source.matched }
      : { kind: "topic" },
    items: outcome.result.map((item, index) => ({
      id: `${quiz?.id ?? "tf"}-${index}`,
      text: item.text,
      correct: item.correct,
      explanation: item.explanation,
      correctedStatement: item.correctedStatement,
    })),
  });
}
