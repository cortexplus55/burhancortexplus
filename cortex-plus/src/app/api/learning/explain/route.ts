import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import {
  EXPLAIN_SCHEMA_HINT,
  buildExplainPrompt,
  explainSchema,
  isLongEnough,
} from "@/lib/learning/explain-review";

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
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "explain", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { topic, explanation } = parsed.data;

  // Üç kelimelik bir anlatımı modele göndermek hem parayı hem öğrencinin
  // zamanını harcar; geri dönecek şey de "daha çok anlat" olurdu.
  if (!isLongEnough(explanation)) {
    return errorResponse(400, "too_short");
  }

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    isPremium: await isPremiumUser(service, userId),
    schemaHint: EXPLAIN_SCHEMA_HINT,
    userPrompt: buildExplainPrompt(topic, explanation),
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

  return NextResponse.json(outcome.data);
}
