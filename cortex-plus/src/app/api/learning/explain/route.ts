import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { studioTeacherSource } from "@/lib/learning/studio-teacher-source";
import {
  EXPLAIN_SCHEMA_HINT,
  buildExplainPrompt,
  explainSchema,
  isLongEnough,
} from "@/lib/learning/explain-review";
import { saveExplainAttempt } from "@/lib/learning/explain-history-store";

/**
 * Öğrencinin anlatımını değerlendirir.
 *
 * Kredi olarak sohbet bütçesini kullanıyor: tek bir model çağrısı, sohbetteki
 * bir soruyla aynı büyüklükte. Ayrı bir kural satırı açmak, kural tablosuna
 * elle satır eklemeyi gerektirirdi ve bu özelliği yayına çıkmadan
 * bekletirdi.
 */
const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  explanation: z.string().min(1).max(8000),
  /** Belgeden (24 Ekim 2026): anlatım öğrencinin kendi notuna göre değerlendirilir. */
  documentId: z.string().uuid().optional(),
  probe: z.string().max(800).optional(),
});

/** Değerlendirmeye giden kaynak metnin üst sınırı (karakter). */
const SOURCE_CHAR_CAP = 12_000;

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "explain", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { topic, explanation, documentId, probe } = parsed.data;

  // Üç kelimelik bir anlatımı modele göndermek hem parayı hem öğrencinin
  // zamanını harcar; geri dönecek şey de "daha çok anlat" olurdu.
  if (!isLongEnough(explanation)) {
    return errorResponse(400, "too_short");
  }

  // Hak ayrılmadan önce: belge hazır değilse net sebep, kayıp yok.
  const source = documentId ? await studioTeacherSource(service, { userId, topic, documentId }) : null;
  if (documentId && !source) return errorResponse(409, "document_not_ready");
  const sourceText = source ? source.pages.map((page) => page.text).join("\n\n").slice(0, SOURCE_CHAR_CAP) : undefined;

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    // Ücretsizde sohbet mesajı sayılır (24 Ekim 2026, ürün sahibinin kararı): "Anlatarak öğren" Araçlar'dan
    // ve Yanlışlarım'dan açılıyor, ders içi yardımcı değil — `freeMeter` verilmez, varsayılan "chat".
    isPremium: await isPremiumUser(service, userId),
    schemaHint: EXPLAIN_SCHEMA_HINT,
    userPrompt: buildExplainPrompt(topic, explanation, sourceText),
    parse: (raw) => {
      const result = explainSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error ?? "generation_failed" },
      { status: outcome.status ?? 500 },
    );
  }

  const saved = await saveExplainAttempt(service, {
    userId,
    topic,
    explanation,
    documentId,
    probe,
    review: outcome.data,
  });

  return NextResponse.json({
    ...outcome.data,
    attemptId: saved?.id ?? null,
    createdAt: saved?.createdAt ?? new Date().toISOString(),
    ...(source && documentId
      ? { source: { kind: "document", documentId, fileName: source.fileName, wholeDocument: source.wholeDocument, matched: source.matched } }
      : {}),
  });
}
