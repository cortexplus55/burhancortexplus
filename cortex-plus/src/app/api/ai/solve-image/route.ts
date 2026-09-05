import { NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { moderate } from "@/lib/ai/moderation";
import { recordAbuse } from "@/lib/abuse/record";
import { z } from "zod";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

const resultSchema = z.object({
  problem: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  answer: z.string().min(1),
  tip: z.string().optional().default(""),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "solve-image", limit: 8, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const form = await request.formData();
  const file = form.get("file");
  const note = String(form.get("note") ?? "").slice(0, 500);

  if (!(file instanceof File) || file.size > MAX_BYTES || !ALLOWED.has(file.type)) {
    return errorResponse(400, "invalid_input");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

  // Görsel de denetimden geçiyor. Buraya yüklenen şeyin ödev fotoğrafı
  // olduğunu varsayamayız; kamera açılan her yerden her şey gelebilir.
  const verdict = await moderate({ text: note, imageUrls: [dataUrl] });
  if (verdict.action !== "allow") {
    void recordAbuse({
      signal: "moderation",
      severity: verdict.action === "flag" ? "low" : "high",
      scope: "solve-image",
      userId,
      request,
      metadata: { categories: verdict.categories, outcome: verdict.action },
    });
  }
  if (verdict.action === "block" || verdict.action === "support") {
    // Kredi henüz ayrılmadı; engellenen istek öğrencinin hakkını yakmıyor.
    return NextResponse.json(
      { error: verdict.message, moderated: true },
      { status: 422 },
    );
  }

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "IMAGE_SOLUTION",
    isPremium: await isPremiumUser(service, userId),
    hasImage: true,
    imageUrls: [dataUrl],
    schemaHint:
      'Yalnızca şu JSON şemasını döndür: {"problem": string, "steps": string[], "answer": string, "tip": string}. Matematiksel ifadelerde LaTeX kullanabilirsin.',
    userPrompt: note
      ? `Görseldeki soruyu adım adım çöz. Öğrencinin notu: ${note}`
      : "Görseldeki soruyu adım adım çöz ve sonucu açıkla.",
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json({
    ...outcome.data,
    model: outcome.model,
    creditsUsed: outcome.cost,
  });
}
