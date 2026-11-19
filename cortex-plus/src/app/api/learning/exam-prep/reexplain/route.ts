import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { teacherPersona } from "@/lib/learning/teacher-brain";
import { SOURCE_NUMBER_PRIORITY } from "@/lib/learning/teaching-rubric";
import {
  REEXPLAIN_REPLY_MAX,
  REEXPLAIN_TEXT_MAX,
  REEXPLAIN_VARIANTS_MAX,
  introducedNumbers,
  reexplainStepKey,
  reexplainUserPrompt,
} from "@/lib/learning/step-reexplain";
import { studentOutputText } from "@/lib/learning/student-output-firewall";
import { FREE_LIMITS, TRIAL_PERIOD_KEY } from "@/lib/billing/free-meters";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
  heading: z.string().min(1).max(240),
  text: z.string().min(20).max(REEXPLAIN_TEXT_MAX * 2),
  previous: z.array(z.string().min(1).max(REEXPLAIN_REPLY_MAX)).max(4).optional(),
});

const replySchema = z.object({
  reply: z.string().min(20).max(REEXPLAIN_REPLY_MAX),
});

const CACHE_TABLE = "exam_prep_step_reexplains";

type FreeTrial = { used: number; limit: number };

/** Ücretsiz hesabın "Farklı anlat" denemesi (Faz 4): toplam 10, dönemsiz sayaç. Abonede null. */
async function freeTrialState(
  service: Parameters<typeof isPremiumUser>[0],
  userId: string,
  premium: boolean,
): Promise<FreeTrial | null> {
  if (premium) return null;
  const { data, error } = await service
    .from("free_usage")
    .select("used")
    .eq("user_id", userId)
    .eq("meter", "reexplain")
    .eq("period_key", TRIAL_PERIOD_KEY)
    .maybeSingle();
  if (error) {
    console.error("reexplain_trial_read_failed", { message: error.message });
    return { used: 0, limit: FREE_LIMITS.reexplain };
  }
  const used = Math.max(0, Math.min(FREE_LIMITS.reexplain, Number((data as { used?: unknown } | null)?.used ?? 0)));
  return { used, limit: FREE_LIMITS.reexplain };
}

/** Rozetin ilk durumu: "Ücretsiz deneme: X/10" (abonede rozet yok). */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-reexplain-state", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const premium = await isPremiumUser(service, userId);
  return NextResponse.json({ ok: true, freeTrial: await freeTrialState(service, userId, premium) });
}

/**
 * Ders adımını farklı anlat (10 Kasım 2026). Adım öğrencinin kendi dersinden gelir; hazırlık ve adım sahipliği doğrulanır.
 *
 * Faz 4 (19 Kasım 2026, Burhan'ın kararı):
 * - Ücret 4 kredi (`STEP_REEXPLAIN`); ücretsiz hesapta ilk ders döngüsü boyunca TOPLAM 10 hak (`reexplain` sayacı,
 *   SQL `credit_reserve_metered` zorunlu kılar; aşılırsa 402).
 * - Adım başına önbellek: aynı adımın aynı sıradaki anlatımı (`variant` = önceki anlatım sayısı) kayıttan döner;
 *   kredi, kullanım kaydı ve model çağrısı yok.
 * - İkinci denetçi çağrısı kalktı (`verificationMode: "schema"`): kurallar tek isteme gömülü; Faz 2 (madde 7.1)
 *   kilidi aynen sürer — DEĞİŞMEZ OLGULAR istemde, adımda olmayan sayı getiren taslak deterministik olarak reddedilir
 *   ve aynı rezervasyonla yeniden yazılır; tutmazsa hak iade edilir.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-reexplain", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id, session_meta")
    .eq("id", parsed.data.nodeId)
    .eq("exam_prep_id", parsed.data.prepId)
    .maybeSingle();
  if (!node) return errorResponse(404, "not_found");
  const topicTitle = (node.session_meta as { topicTitle?: unknown } | null)?.topicTitle;
  const topicLabel = typeof topicTitle === "string" && topicTitle.trim() ? topicTitle.trim() : String(prep.title);

  const premium = await isPremiumUser(service, userId);
  const stepKey = reexplainStepKey(parsed.data.heading, parsed.data.text);
  const variant = Math.min(REEXPLAIN_VARIANTS_MAX - 1, (parsed.data.previous ?? []).length);

  const { data: cached, error: cacheError } = await service
    .from(CACHE_TABLE)
    .select("reply")
    .eq("user_id", userId)
    .eq("node_id", parsed.data.nodeId)
    .eq("step_key", stepKey)
    .eq("variant", variant)
    .maybeSingle();
  if (cacheError) console.error("reexplain_cache_read_failed", { message: cacheError.message });
  const cachedReply = (cached as { reply?: unknown } | null)?.reply;
  if (typeof cachedReply === "string" && cachedReply.trim()) {
    return NextResponse.json({
      ok: true,
      reply: studentOutputText(cachedReply),
      cached: true,
      freeTrial: await freeTrialState(service, userId, premium),
    });
  }

  let lastIntroduced: string[] = [];
  const outcome = await generateJson({
    service,
    userId,
    actionCode: "STEP_REEXPLAIN",
    freeMeter: "reexplain",
    // Aynı adımın aynı sıradaki anlatımı aynı işlemdir: çift tıklama ikinci kez ücretlenmez.
    idempotencyKey: `reexplain:${parsed.data.nodeId}:${stepKey}:${variant}`,
    isPremium: premium,
    verificationMode: "schema",
    maxDraftAttempts: 2,
    schemaHint: 'JSON: {"reply":string}. Türkçe; 4-8 cümle, son satır "Kısaca:" ile başlar.',
    // Adımın sayıları notun sayılarıdır: yazar "düzeltmesin" (tek istem; ayrı denetçi yok).
    systemAddendum: SOURCE_NUMBER_PRIORITY,
    userPrompt: `${teacherPersona()}\n${reexplainUserPrompt({
      prepTitle: String(prep.title),
      topicLabel,
      heading: parsed.data.heading,
      text: parsed.data.text,
      previous: parsed.data.previous,
    })}`,
    // Faz 2 (madde 7.1): adımda olmayan sayı (yeni olgu) gelirse taslak reddedilir ve aynı rezervasyonla yeniden
    // yazılır; tutmazsa öğrenciye kayan bir anlatım gösterilmez (hak iade edilir).
    parse: (raw) => {
      const reply = replySchema.safeParse(raw).data ?? null;
      if (!reply) return null;
      lastIntroduced = introducedNumbers(reply.reply, parsed.data.text);
      return lastIntroduced.length ? null : reply;
    },
    describeParseFailure: () =>
      lastIntroduced.length
        ? [
            `Şu sayılar adımın ilk anlatımında yok: ${lastIntroduced.join(", ")}. Yeni sayı/olgu ekleme; yalnız ` +
              "DEĞİŞMEZ OLGULAR listesindeki sayıları aynen kullan.",
          ]
        : [],
  });
  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.error, freeTrial: await freeTrialState(service, userId, premium) },
      { status: outcome.status },
    );
  }

  const reply = studentOutputText(outcome.data.reply);
  const { error: saveError } = await service.from(CACHE_TABLE).upsert(
    {
      user_id: userId,
      exam_prep_id: parsed.data.prepId,
      node_id: parsed.data.nodeId,
      step_key: stepKey,
      variant,
      reply,
    },
    { onConflict: "user_id,node_id,step_key,variant", ignoreDuplicates: true },
  );
  if (saveError) console.error("reexplain_cache_write_failed", { message: saveError.message });

  return NextResponse.json({ ok: true, reply, cached: false, freeTrial: await freeTrialState(service, userId, premium) });
}
