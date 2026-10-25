import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { recordUserActivity } from "@/lib/streak/record-activity";
import {
  oralPercentScore,
  reconcileOralGrade,
  sanitizeGap,
} from "@/lib/learning/oral-review";
import { examinerVibeGradeLine, parseExaminerVibe } from "@/lib/learning/examiner-vibe";
import { oralFirstAnswerKey } from "@/lib/learning/oral-first-answer";
import { collectFactConflicts, factCheckUserPrompt, withFactConflicts } from "@/lib/learning/oral-fact-check";
import type { OralGradeItem } from "@/lib/learning/oral-review";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  examinerVibe: z.string().optional(),
  items: z
    .array(
      z.object({
        prompt: z.string().min(1),
        answer: z.string().min(1),
        /** Takip sorusundan önceki cevap; yoksa `answer` ilk cevaptır. */
        firstAnswer: z.string().max(4000).optional(),
        expectedPoints: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(8),
  /** Kaynak sayfaları. Boşsa olgu denetimi çalışmaz. */
  source: z.string().max(20_000).optional(),
});

const resultSchema = z.object({
  score: z.number().int().min(0).max(100).optional(),
  verdict: z.string().min(1).optional(),
  feedback: z.string().min(8).optional(),
  missingPoints: z.array(z.string()).optional().default([]),
  suggestedAnswer: z.string().optional().default(""),
  items: z
    .array(
      z.object({
        index: z.number().int().min(0),
        correct: z.boolean(),
        gap: z.string().max(400).optional().nullable(),
        errors: z
          .array(z.object({ wrong: z.string().max(240), correct: z.string().max(300) }))
          .optional()
          .nullable(),
      }),
    )
    .optional(),
  correctCount: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "oral-grade", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");

  // Beklenen noktalar (belgeden) varsa değerlendirme onlara göre yapılır (19 Ekim 2026; önce yalnız
  // soru ve cevap gidiyordu, belgeli sözlü de modelin genel bilgisiyle notlanıyordu).
  const lines = parsedBody.data.items
    .map(
      (item, i) =>
        `${i + 1}. index=${i}\nSoru: ${item.prompt}\n` +
        (item.expectedPoints?.length ? `Beklenen noktalar: ${item.expectedPoints.join(" | ")}\n` : "") +
        (item.firstAnswer?.trim() && item.firstAnswer.trim() !== item.answer.trim()
          ? `İlk cevap (takip sorusundan önce): ${item.firstAnswer.trim()}\n`
          : "") +
        `Cevap: ${item.answer}`,
    )
    .join("\n\n");

  const premium = await isPremiumUser(service, userId);
  const source = parsedBody.data.source?.trim() ?? "";
  const factAnswers = parsedBody.data.items.map((item, index) => ({
    index,
    answer: (item.firstAnswer?.trim() || item.answer).trim(),
  }));
  const conflictsTask = collectFactConflicts({
    source,
    answers: factAnswers,
    model: source
      ? generateJson({
          service,
          userId,
          actionCode: "PRACTICE_EXAM_GRADE",
          isPremium: premium,
          schemaHint:
            'Yalnızca JSON: {"items":[{"index":number,"errors":[{"wrong":string,"correct":string}]}]}. wrong öğrencinin cümlesinden birebir alıntı, correct kaynağın cümlesinden birebir alıntı. Eksik anlatım ve aynı anlamı başka sözle söylemek hata değildir.',
          userPrompt: factCheckUserPrompt(factAnswers, source),
          parse: (raw) => raw,
        }).then((result) => (result.ok ? result.data : null))
      : null,
  });
  const outcome = await generateJson({
    service,
    userId,
    actionCode: "PRACTICE_EXAM_GRADE",
    isPremium: premium,
    schemaHint:
      'Yalnızca şu JSON: {"items":[{"index":number,"correct":boolean,"gap":string|null,"errors":[{"wrong":string,"correct":string}]}],"correctCount":number,"verdict":string,"feedback":string,"missingPoints":string[],"suggestedAnswer":string}. Kaynakta hazır çözüm cümlesi yok diye 0 verme; rubriğe göre değerlendir. gap alanına soru metnini yazma. errors: öğrencinin İLK cevabındaki (ilk cevap verilmediyse Cevap) kavramsal, matematiksel ya da olgusal yanlışlar; "wrong" o cevaptan birebir alıntı, "correct" doğrusu. Sonradan düzeltilmiş olsa da yaz; eksik bırakılan nokta yanlış değildir; yanlış yoksa boş dizi.',
    userPrompt: `Sözlü: ${parsedBody.data.title}. ${examinerVibeGradeLine(parseExaminerVibe(parsedBody.data.examinerVibe))} Öğrenci cevaplarını değerlendir. Doğru olanı, eksik olanı ve yanlış olanı ayır. Soruda olmayan bir doğruyu puanlama. Cevap konuşma tanımasından gelmiş olabilir: bitişik veya ayrı yazım ve sesçe yakın terimler aynı noktadır. Yanlış sayı, ters yön (artar, azalır, değişmez), yanlış tarih, yanlış madde numarası veya yanlış sıra yine eksiktir.\n\n${lines}`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);
  const conflicts = await conflictsTask;
  const mergedItems = withFactConflicts(outcome.data.items ?? null, conflicts);
  const modelItems: OralGradeItem[] | null = mergedItems
    ? mergedItems.map((item) => {
        const row = item as OralGradeItem;
        return {
          index: row.index,
          correct: typeof row.correct === "boolean" ? row.correct : false,
          gap: row.gap ?? null,
          errors: row.errors ?? [],
        };
      })
    : null;

  const answers: Record<string, unknown> = {};
  parsedBody.data.items.forEach((item, index) => {
    answers[String(index)] = item.answer;
    if (item.firstAnswer?.trim()) answers[oralFirstAnswerKey(index)] = item.firstAnswer;
  });
  const reconciled = reconcileOralGrade({
    questions: parsedBody.data.items.map((item) => ({
      prompt: item.prompt,
      expectedPoints: item.expectedPoints,
    })),
    answers,
    modelItems,
    modelCorrectCount: outcome.data.correctCount ?? null,
  });
  const score = oralPercentScore(reconciled.correctCount, reconciled.total);
  const missingPoints = reconciled.items
    .filter((item) => !item.correct && item.gap)
    .map((item) => item.gap!)
    .filter(Boolean);
  // Strip any residual prompt echoes from model missingPoints.
  const cleanedMissing = [
    ...new Set(
      [
        ...missingPoints,
        ...(outcome.data.missingPoints ?? []).map((gap, i) =>
          sanitizeGap(gap, parsedBody.data.items[i]?.prompt ?? ""),
        ),
      ].filter((g): g is string => Boolean(g)),
    ),
  ];

  try {
    await recordUserActivity(service, userId, "oral");
  } catch {
    // streak additive
  }

  return NextResponse.json({
    score,
    verdict: outcome.data.verdict ?? (score >= 70 ? "İyi" : "Geliştir"),
    feedback:
      outcome.data.feedback ??
      `Doğru: ${reconciled.correctCount}/${reconciled.total}.`,
    missingPoints: cleanedMissing,
    suggestedAnswer: outcome.data.suggestedAnswer ?? "",
    correctIndices: reconciled.correctIndices,
    items: reconciled.items,
  });
}
