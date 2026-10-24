import { NextResponse, after } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { moderate } from "@/lib/ai/moderation";
import { recordAbuse } from "@/lib/abuse/record";
import { titleConversation } from "@/lib/ai/conversation-title";
import { runSolve, type SolveEvent } from "@/lib/solve/solve-run";
import { saveSolveToChat } from "@/lib/solve/solve-chat-save";
import { solutionMarkdown, solveUserLine } from "@/lib/solve/solution-markdown";
import type { Solution } from "@/lib/solve/question-solver";
import { signReviewToken, solutionReviewItem } from "@/lib/solve/solve-review";

/*
  Soru çözücü (23 Ekim 2026): fotoğraf ya da yazılı soru → olay akışı (satır başına bir JSON). İlk çözüm ~8-12 sn'de
  gelir, denetim arkadan "verified" / "revised" olayıyla. Ayrıntı: `src/lib/solve/solve-run.ts`.
  Vercel gövde sınırı 4,5 MB: istemci fotoğrafı göndermeden önce küçültür (`downscale-image.ts`).
*/
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIN_TEXT = 8;
const UNCERTAIN_NOTE = "Emin değiliz: iki ayrı çözüm farklı sonuç verdi; cevabı kitabınla karşılaştır.";

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "solve", limit: 8, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const form = await request.formData().catch(() => null);
  if (!form) return errorResponse(400, "invalid_input");
  const file = form.get("file");
  const text = String(form.get("text") ?? "").trim().slice(0, 4000);
  const operationId = String(form.get("operationId") ?? "").slice(0, 80) || crypto.randomUUID();
  // Sohbetten gelen soru: çözüm sohbete yazılır, sonraki mesajlar onu bağlam olarak okur.
  const toChat = form.get("chat") === "1";
  const rawConversation = String(form.get("conversationId") ?? "");
  const conversationId = /^[0-9a-f-]{36}$/i.test(rawConversation) ? rawConversation : undefined;
  // Hazırlıktan açılan çözücü: şıklı soru tekrar listesine eklenebilir.
  const reviewable = form.get("review") === "1";
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && (file.size > MAX_BYTES || !ALLOWED.has(file.type))) return errorResponse(400, "invalid_input");
  if (!hasFile && text.length < MIN_TEXT) return errorResponse(400, "invalid_input");

  const imageDataUrl = hasFile ? `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}` : undefined;

  const verdict = await moderate({ text, imageUrls: imageDataUrl ? [imageDataUrl] : [] });
  if (verdict.action !== "allow") {
    void recordAbuse({
      signal: "moderation",
      severity: verdict.action === "flag" ? "low" : "high",
      scope: "solve",
      userId,
      request,
      metadata: { categories: verdict.categories, outcome: verdict.action },
    });
  }
  if (verdict.action === "block" || verdict.action === "support") {
    return NextResponse.json({ error: verdict.message, code: "moderated" }, { status: 422 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: SolveEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // İstemci kapandı; iş sürer, kredi sonucu yine yazılır.
        }
      };
      // Sohbete kayıt ilk çözümle yapılır, denetimi beklemez: öğrenci hemen sonraki soruyu yazabilir ve o soru bu
      // sohbete düşer. Denetim çözümü düzeltirse kaydedilen metin de düzeltilir.
      const pending: Promise<unknown>[] = [];
      let saving: Promise<{ messageId: string } | null> | null = null;
      const saveFirst = (solution: Solution, note: string | undefined) => {
        const userMessage = solveUserLine(solution, text || undefined, hasFile) || text;
        const content = solutionMarkdown(solution, note);
        saving = saveSolveToChat(service, { userId, conversationId, userMessage, content })
          .catch(() => null)
          .then((saved) => {
            if (!saved) return null;
            emit({ type: "saved", conversationId: saved.conversationId, messageId: saved.messageId });
            if (saved.created) {
              after(() => titleConversation(service, { userId, conversationId: saved.conversationId, message: userMessage, answer: content }));
            }
            return { messageId: saved.messageId };
          });
        pending.push(saving);
      };
      const saveRevision = (solution: Solution, note: string) => {
        if (!saving) return;
        pending.push(
          saving.then(async (saved) => {
            if (!saved) return;
            await service.from("messages").update({ content: solutionMarkdown(solution, note) })
              .eq("id", saved.messageId).eq("user_id", userId);
          }).catch(() => undefined),
        );
      };
      try {
        await runSolve({ service, userId, imageDataUrl, text: text || undefined, idempotencyKey: `solve:${userId}:${operationId}` }, (event) => {
          emit(event);
          if (reviewable && (event.type === "solution" || event.type === "revised")) {
            const item = event.type === "solution" && event.status === "uncertain" ? null : solutionReviewItem(event.solution);
            const token = item ? signReviewToken({ userId, ref: operationId, item }) : null;
            if (token) emit({ type: "reviewable", token });
          }
          if (!toChat) return;
          if (event.type === "solution") saveFirst(event.solution, event.status === "uncertain" ? UNCERTAIN_NOTE : undefined);
          else if (event.type === "revised") saveRevision(event.solution, event.note);
        });
        await Promise.all(pending);
      } finally {
        try {
          controller.close();
        } catch {
          // zaten kapalı
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
