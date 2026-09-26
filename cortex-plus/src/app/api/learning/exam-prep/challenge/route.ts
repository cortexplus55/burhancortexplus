import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import {
  acceptChallengeSet,
  buildChallengeSource,
  challengePrompt,
} from "@/lib/learning/challenge-set";
import { missingColumn } from "@/lib/learning/missing-column";
import { prepSourceDocumentIds } from "@/lib/learning/prep-source";
import { publicQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";

const bodySchema = z.object({
  prepId: z.string().uuid(),
});

type StoredChallenge = {
  documentIds?: unknown;
  questions?: unknown;
};

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((id, index) => id === b[index]);
}

function storedQuestions(value: unknown, documentIds: string[]): QuizQuestion[] | null {
  if (!value || typeof value !== "object") return null;
  const row = value as StoredChallenge;
  const ids = Array.isArray(row.documentIds)
    ? row.documentIds.filter((id): id is string => typeof id === "string")
    : [];
  if (!sameIds(ids, documentIds) || !Array.isArray(row.questions)) return null;
  const questions = row.questions.filter(
    (item): item is QuizQuestion =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as QuizQuestion).text === "string" &&
      Array.isArray((item as QuizQuestion).options) &&
      Array.isArray((item as QuizQuestion).correct) &&
      typeof (item as QuizQuestion).explanation === "string",
  );
  return questions.length ? questions : null;
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-challenge", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, document_id, source_document_ids")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const documentIds = prepSourceDocumentIds({
    documentId: prep.document_id as string | null,
    sourceDocumentIds: Array.isArray(prep.source_document_ids)
      ? (prep.source_document_ids as string[])
      : [],
  });

  const cached = await service
    .from("exam_preps")
    .select("challenge_set")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!cached.error) {
    const questions = storedQuestions(cached.data?.challenge_set, documentIds);
    if (questions?.length) {
      return NextResponse.json({
        ok: true,
        cached: true,
        questions: questions.map(publicQuizQuestion),
      });
    }
  }

  const { data: topicRows } = await service
    .from("exam_prep_topics")
    .select("label")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  const topics = (topicRows ?? []).map((row) => String(row.label)).filter(Boolean);

  const { data: pages } = documentIds.length
    ? await service
        .from("document_pages")
        .select("document_id, page_number, text_content")
        .in("document_id", documentIds)
        .order("page_number")
    : { data: [] as { document_id: string; page_number: number; text_content: string | null }[] };

  const source = buildChallengeSource(
    (pages ?? []).map((page) => ({
      documentId: page.document_id as string,
      pageNumber: page.page_number as number,
      text: (page.text_content as string | null) ?? "",
    })),
  );
  if (!source.trim()) {
    return NextResponse.json(
      { error: "Zor soru için okunmuş bir kaynak yok. Önce materyal yükle." },
      { status: 400 },
    );
  }

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "QUIZ_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    difficulty: "hard",
    verificationMode: "schema",
    maxDraftAttempts: 1,
    idempotencyKey: `challenge:${prepId}:${[...documentIds].sort().join(",")}`,
    schemaHint:
      'JSON: {"questions":[{"text":string,"options":string[],"correct":string,"multi":false,"explanation":string,"topic":string}]}',
    userPrompt: challengePrompt({
      title: (prep.title as string) || (prep.exam_type as string) || "Sınav",
      topics,
      source,
    }),
    parse: (raw) => {
      const questions = acceptChallengeSet(raw, source);
      return questions.length ? { questions } : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const save = await service
    .from("exam_preps")
    .update({
      challenge_set: { documentIds, questions: outcome.data.questions },
    })
    .eq("id", prepId)
    .eq("user_id", userId);
  if (save.error && !missingColumn(save.error)) {
    console.error("challenge cache", save.error.message);
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    questions: outcome.data.questions.map(publicQuizQuestion),
  });
}
