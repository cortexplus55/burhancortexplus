import "server-only";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { clientKey, rateLimit, userKey } from "@/lib/rate-limit";

/**
 * Schools and dorms put hundreds of students behind a single address, so an IP
 * bucket cannot carry the per-caller quota: it would lock out a whole class
 * while still letting one person through by rotating networks. The IP gate is
 * therefore deliberately loose — it only stops an unauthenticated flood from
 * burning a Supabase auth lookup per request — and the configured `limit` is
 * charged to the user id once the session is known.
 */
const IP_GATE_MULTIPLIER = 8;
const IP_GATE_FLOOR = 120;

function tooManyRequests() {
  return NextResponse.json(
    { error: "Çok fazla istek gönderildi. Lütfen biraz bekleyin." },
    { status: 429 },
  );
}

export type ApiContext = {
  userId: string;
  email: string | null;
  service: ReturnType<typeof createServiceClient>;
  /**
   * Caller-scoped client. Prefer it for writes the caller should be allowed to
   * make on their own, so RLS stays in force; reach for `service` only where a
   * route legitimately needs to read past the caller's own rows.
   */
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export async function withUser(
  request: Request,
  options: { scope: string; limit?: number; windowSeconds?: number },
): Promise<{ ok: true; ctx: ApiContext } | { ok: false; response: NextResponse }> {
  const limit = options.limit ?? 30;
  const windowSeconds = options.windowSeconds ?? 60;

  const ipGate = await rateLimit(
    clientKey(request, options.scope),
    Math.max(limit * IP_GATE_MULTIPLIER, IP_GATE_FLOOR),
    windowSeconds,
  );
  if (!ipGate.allowed) {
    return { ok: false, response: tooManyRequests() };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Bu işlem için giriş yapmalısın." },
        { status: 401 },
      ),
    };
  }

  const userGate = await rateLimit(
    userKey(user.id, options.scope),
    limit,
    windowSeconds,
  );
  if (!userGate.allowed) {
    return { ok: false, response: tooManyRequests() };
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      email: user.email ?? null,
      service: createServiceClient(),
      supabase,
    },
  };
}

/**
 * `request.json()` throws on a malformed body, which surfaces as a 500 instead
 * of a 400. Callers pair this with `safeParse` to reject both shapes the same
 * way.
 */
export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

export function errorResponse(status: number, code: string) {
  const messages: Record<string, string> = {
    insufficient_credits:
      "Bu işlem için yeterli kredin veya ücretsiz hakkın kalmadı.",
    parent_coach_exhausted:
      "Ücretsiz Destek hakkın doldu. Plus gerekmez; kota yenilenince tekrar yazabilirsin.",
    invalid_action: "Geçersiz işlem tanımı.",
    ai_not_configured: "AI servisi henüz yapılandırılmadı.",
    invalid_ai_response: "Yapay zekâ yanıtı işlenemedi. Tekrar dener misin?",
    generation_failed: "İçerik üretilemedi. Lütfen tekrar deneyin.",
    invalid_input: "Gönderilen bilgiler geçersiz.",
    not_found: "Kayıt bulunamadı.",
    forbidden: "Bu içeriğe erişim yetkin yok.",
    no_topics: "Önce en az bir konu ekle.",
  };
  return NextResponse.json(
    { error: messages[code] ?? "Beklenmeyen bir hata oluştu." },
    { status },
  );
}
