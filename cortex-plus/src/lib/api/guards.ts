import "server-only";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export type ApiContext = {
  userId: string;
  email: string | null;
  service: ReturnType<typeof createServiceClient>;
};

export async function withUser(
  request: Request,
  options: { scope: string; limit?: number; windowSeconds?: number },
): Promise<{ ok: true; ctx: ApiContext } | { ok: false; response: NextResponse }> {
  const limit = await rateLimit(
    clientKey(request, options.scope),
    options.limit ?? 30,
    options.windowSeconds ?? 60,
  );
  if (!limit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Çok fazla istek gönderildi. Lütfen biraz bekleyin." },
        { status: 429 },
      ),
    };
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

  return {
    ok: true,
    ctx: {
      userId: user.id,
      email: user.email ?? null,
      service: createServiceClient(),
    },
  };
}

export function errorResponse(status: number, code: string) {
  const messages: Record<string, string> = {
    insufficient_credits:
      "Bu işlem için yeterli kredin veya ücretsiz hakkın kalmadı.",
    invalid_action: "Geçersiz işlem tanımı.",
    ai_not_configured: "AI servisi henüz yapılandırılmadı.",
    invalid_ai_response: "Yapay zekâ yanıtı işlenemedi. Tekrar dener misin?",
    generation_failed: "İçerik üretilemedi. Lütfen tekrar deneyin.",
    invalid_input: "Gönderilen bilgiler geçersiz.",
    not_found: "Kayıt bulunamadı.",
    forbidden: "Bu içeriğe erişim yetkin yok.",
  };
  return NextResponse.json(
    { error: messages[code] ?? "Beklenmeyen bir hata oluştu." },
    { status },
  );
}
