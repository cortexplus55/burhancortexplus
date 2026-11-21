import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parityGreetingName } from "@/components/parity/app-utils";
import { recordUsage } from "@/lib/credits/service";
import { istanbulDay } from "@/lib/istanbul-day";
import { studentCalibration } from "@/lib/learning/student-pedagogy";
import { bindConversationPrep } from "@/lib/tutor/conversation-groups";
import { buildTutorStudentContext } from "@/lib/tutor/student-context";
import { buildRealtimeInstructions, type VoiceHistoryTurn } from "@/lib/tutor/realtime-instructions";
import { REALTIME_MODEL, type RealtimeUsageSnapshot } from "@/lib/tutor/realtime/config";
import { conversationTitleFrom, type SavedTurn } from "@/lib/tutor/realtime/transcript";
import { realtimeUsageRows, REALTIME_PRICES_PER_1K } from "@/lib/tutor/realtime/usage";

/*
  Sesli dersin veritabanı işleri (21 Kasım 2026): talimatın okumaları, konuşmanın sohbete kaydı, gider satırları. Bütün
  okumalar ve yazımlar sunucu anahtarıyla ve öğrencinin kimliğiyle süzülür (sahiplik burada denetlenir: başkasının
  sohbeti ya da hazırlığı sessizce yok sayılır). Bir okuma düşerse o parça talimata girmez; ders yine başlar.
*/

const HISTORY_LIMIT = 6;

type Row = Record<string, unknown>;

export type VoiceContext = {
  instructions: string;
  /** Öğrencinin kendi, silinmemiş sohbeti; değilse null. */
  conversationId: string | null;
  /** Öğrencinin kendi hazırlığı; değilse null. */
  prepId: string | null;
};

async function settle<T>(work: PromiseLike<T>, fallback: T, source: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    console.warn("realtime_context_source_failed", { source, cause: error instanceof Error ? error.name : "unknown" });
    return fallback;
  }
}

function daysLeft(examDate: unknown, now: Date): number | null {
  if (typeof examDate !== "string" || !examDate) return null;
  const exam = Date.parse(`${examDate.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${istanbulDay(now)}T00:00:00Z`);
  if (!Number.isFinite(exam) || !Number.isFinite(today)) return null;
  return Math.round((exam - today) / 86_400_000);
}

/** Talimatın girdileri ve sahipliği doğrulanmış kimlikler. */
export async function loadVoiceContext(
  service: SupabaseClient,
  userId: string,
  input: { conversationId: string | null; prepId: string | null; trial: boolean; now?: Date },
): Promise<VoiceContext> {
  const now = input.now ?? new Date();
  const [profile, conversation, prep, context] = await Promise.all([
    settle(
      Promise.resolve(service.from("profiles").select("full_name").eq("id", userId).maybeSingle()).then(({ data }) => data as Row | null),
      null,
      "profile",
    ),
    input.conversationId
      ? settle(
          Promise.resolve(
            service
              .from("conversations")
              .select("id")
              .eq("id", input.conversationId)
              .eq("user_id", userId)
              .is("deleted_at", null)
              .maybeSingle(),
          ).then(({ data }) => data as Row | null),
          null,
          "conversation",
        )
      : Promise.resolve(null),
    input.prepId
      ? settle(
          Promise.resolve(
            service.from("exam_preps").select("id, title, exam_date").eq("id", input.prepId).eq("user_id", userId).maybeSingle(),
          ).then(({ data }) => data as Row | null),
          null,
          "prep",
        )
      : Promise.resolve(null),
    settle(buildTutorStudentContext(service, userId, { now }), null, "student_context"),
  ]);
  const conversationId = typeof conversation?.id === "string" ? conversation.id : null;
  const prepId = typeof prep?.id === "string" ? prep.id : null;
  const prepTitle = typeof prep?.title === "string" ? prep.title.trim() : "";

  const [history, calibration] = await Promise.all([
    conversationId
      ? settle(
          Promise.resolve(
            service
              .from("messages")
              .select("role, content")
              .eq("conversation_id", conversationId)
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(HISTORY_LIMIT),
          ).then(({ data }) => ((data as Row[] | null) ?? []).reverse()),
          [] as Row[],
          "history",
        )
      : Promise.resolve([] as Row[]),
    settle(studentCalibration(service, userId, "chat", { prepTitle: prepTitle || null }), null, "calibration"),
  ]);

  const greeting = parityGreetingName(typeof profile?.full_name === "string" ? profile.full_name : null);
  const turns: VoiceHistoryTurn[] = history
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({ role: row.role as "user" | "assistant", text: String(row.content ?? "") }));

  const instructions = buildRealtimeInstructions({
    name: greeting === "Merhaba" ? null : greeting,
    calibration: calibration?.block ?? "",
    context: context?.promptBlock ?? "",
    prep: prepId ? { title: prepTitle || "Sınav hazırlığı", daysLeft: daysLeft(prep?.exam_date, now) } : null,
    history: turns,
    trial: input.trial,
  });
  return { instructions, conversationId, prepId };
}

/**
 * Konuşmayı sohbete yazar: sohbet öğrencinin değilse ya da yoksa yeni sohbet açılır (başlık öğrencinin ilk cümlesi).
 * Mesajlar sırayla, artan zamanla tek seferde. Hazırlık bağlamındaysa konuşma hazırlığa bağlanır (geçmişte gruplanır).
 * Asla fırlatmaz; yazılamazsa null.
 */
export async function saveVoiceConversation(
  service: SupabaseClient,
  input: { userId: string; conversationId: string | null; prepId: string | null; messages: SavedTurn[]; now?: number },
): Promise<string | null> {
  if (!input.messages.length) return null;
  try {
    let conversationId: string | null = null;
    if (input.conversationId) {
      const { data } = await service
        .from("conversations")
        .select("id")
        .eq("id", input.conversationId)
        .eq("user_id", input.userId)
        .is("deleted_at", null)
        .maybeSingle();
      conversationId = typeof (data as Row | null)?.id === "string" ? String((data as Row).id) : null;
    }
    if (!conversationId) {
      const { data, error } = await service
        .from("conversations")
        .insert({ user_id: input.userId, title: conversationTitleFrom(input.messages) })
        .select("id")
        .single();
      if (error || !data) {
        console.warn("realtime_conversation_create_failed", { code: error?.code ?? null });
        return null;
      }
      conversationId = String((data as Row).id);
    }
    const base = (input.now ?? Date.now()) - input.messages.length * 10;
    const rows = input.messages.map((message, index) => ({
      conversation_id: conversationId,
      user_id: input.userId,
      role: message.role,
      content: message.content,
      model: message.role === "assistant" ? REALTIME_MODEL : null,
      created_at: new Date(base + index * 10).toISOString(),
    }));
    const { error } = await service.from("messages").insert(rows);
    if (error) {
      console.warn("realtime_messages_save_failed", { code: error.code ?? null });
      return null;
    }
    await service
      .from("conversations")
      .update({ updated_at: new Date(input.now ?? Date.now()).toISOString() })
      .eq("id", conversationId)
      .eq("user_id", input.userId);
    if (input.prepId) await bindConversationPrep(service, { userId: input.userId, conversationId, prepId: input.prepId });
    return conversationId;
  } catch (error) {
    console.warn("realtime_conversation_save_failed", { cause: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

/** Oturumun gider satırları (`REALTIME_VOICE`, kredi düşmez). Asla fırlatmaz. */
export async function recordRealtimeUsage(
  service: SupabaseClient,
  input: { userId: string; usage: RealtimeUsageSnapshot | null; reservationId?: string | null },
): Promise<void> {
  for (const row of realtimeUsageRows(input.usage)) {
    const price = REALTIME_PRICES_PER_1K[row.model];
    const cost = price ? Math.round(((row.tokensIn / 1000) * price.input + (row.tokensOut / 1000) * price.output) * 1e6) / 1e6 : null;
    try {
      await recordUsage(service, {
        userId: input.userId,
        actionCode: "REALTIME_VOICE",
        model: row.model,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        reservationId: input.reservationId ?? null,
        costUsdEstimate: cost,
      });
    } catch (error) {
      console.warn("realtime_usage_record_failed", { model: row.model, cause: error instanceof Error ? error.name : "unknown" });
    }
  }
}
