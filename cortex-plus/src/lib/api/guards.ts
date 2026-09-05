import "server-only";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  clientKey,
  dailyKey,
  rateLimit,
  retryAfterSeconds,
  trackDistinct,
  userKey,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { hashIp, recordAbuse, requestIp } from "@/lib/abuse/record";

export type ApiContext = {
  userId: string;
  email: string | null;
  service: ReturnType<typeof createServiceClient>;
  /**
   * Kullanıcının kendi istemcisi — satır güvenliği kuralları geçerli.
   * Kapı bunu zaten kurmuş oluyor; uçlar ikinci kez kurup ikinci bir
   * doğrulama turu ödemesin diye burada duruyor.
   */
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export type GuardOptions = {
  scope: string;
  /** Kullanıcı başına pencere içi sınır. */
  limit?: number;
  windowSeconds?: number;
  /**
   * Kullanıcı başına günlük tavan. Verilmezse dakikalık sınırdan türetilir.
   *
   * Neden ayrıca gerekiyor: dakikalık sınır ani seli durduruyor ama yavaş
   * öğütmeyi görmüyor. Dakikada 40 isteğe izin veren bir uç, sınıra hiç
   * takılmadan günde elli binden fazla istek geçirebilir.
   */
  dailyLimit?: number;
  /**
   * Hesabın gün içinde kaç farklı yerden kullanıldığını izler.
   *
   * Yalnızca pahalı uçlarda açılıyor: ek bir Redis turu maliyeti var ve
   * yanında zaten bir yapay zekâ çağrısı duruyorsa bu maliyet yok sayılır.
   * Ucuz bir listeleme ucunda aynı şeyi yapmak, ölçtüğü şeyden pahalıya
   * mal olurdu.
   */
  trackSharing?: boolean;
};

/**
 * Kaç farklı yerden sonra "paylaşılıyor olabilir" denecek.
 *
 * Yüksek tutuldu: bir öğrenci gün içinde evde wifi, yolda mobil veri, okulda
 * başka bir ağ kullanır — üç dört yer tek başına normal. Buna takılan bir
 * hesap zaten engellenmiyor, yalnızca panelde görünüyor.
 */
const SHARING_THRESHOLD = 8;

/**
 * Giriş yapmamış istek için adres başına sınır.
 *
 * Bu sayı düşük tutulabiliyor çünkü giriş yapmamış bir istekten beklenen tek
 * şey 401 almak. Okul ağındaki otuz öğrenci bu kuyruğu paylaşmıyor: onlar
 * giriş yaptığı anda sayaç kendi kimliklerine geçiyor.
 */
const ANON_LIMIT = 20;
const ANON_WINDOW = 60;

function hasAuthCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("sb-");
}

function tooManyResponse(result: RateLimitResult, message?: string) {
  return NextResponse.json(
    {
      error:
        message ?? "Çok fazla istek gönderildi. Lütfen biraz bekleyin.",
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds(result)) },
    },
  );
}

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Bu işlem için giriş yapmalısın." },
    { status: 401 },
  );
}

/** Giriş yapmamış isteğin adres kuyruğu — doğrulama sunucusuna gitmeden önce. */
async function anonGate(request: Request, scope: string) {
  const result = await rateLimit(
    clientKey(request, `anon:${scope}`),
    ANON_LIMIT,
    ANON_WINDOW,
  );
  if (!result.allowed) {
    void recordAbuse({
      signal: "rate_limit",
      scope,
      request,
      metadata: { stage: "anon", limit: ANON_LIMIT },
    });
  }
  return result;
}

export async function withUser(
  request: Request,
  options: GuardOptions,
): Promise<{ ok: true; ctx: ApiContext } | { ok: false; response: NextResponse }> {
  const { scope } = options;
  const limit = options.limit ?? 30;
  const windowSeconds = options.windowSeconds ?? 60;
  const dailyLimit = options.dailyLimit ?? Math.max(100, limit * 20);

  // 1) Oturum çerezi yoksa sonuç zaten 401. Doğrulama sunucusuna gitmeden
  //    kesiyoruz; yoksa giriş yapmamış bir sel, her istekte bize bir ağ turu
  //    ödetirdi.
  if (!hasAuthCookie(request)) {
    const anon = await anonGate(request, scope);
    return {
      ok: false,
      response: anon.allowed ? unauthorizedResponse() : tooManyResponse(anon),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Çerez var ama geçersiz. Süresi dolmuş oturum da olabilir, elde
    // tutulmuş bir çerezle deneme de — ikisi de adres kuyruğuna yazılır.
    const anon = await anonGate(request, scope);
    return {
      ok: false,
      response: anon.allowed ? unauthorizedResponse() : tooManyResponse(anon),
    };
  }

  // 2) Asıl sınır kişiye bağlı.
  const perMinute = await rateLimit(userKey(user.id, scope), limit, windowSeconds);
  if (!perMinute.allowed) {
    void recordAbuse({
      signal: "rate_limit",
      scope,
      userId: user.id,
      request,
      metadata: { limit, windowSeconds },
    });
    return { ok: false, response: tooManyResponse(perMinute) };
  }

  // 3) Günlük tavan. Dakikalık sınıra takılan istek buraya hiç gelmiyor:
  //    engellenmiş bir seri, günlük bütçeyi yemesin.
  const perDay = await rateLimit(dailyKey(user.id, scope), dailyLimit, 86400);
  if (!perDay.allowed) {
    void recordAbuse({
      signal: "daily_cap",
      severity: "medium",
      scope,
      userId: user.id,
      request,
      metadata: { dailyLimit },
    });
    return {
      ok: false,
      response: tooManyResponse(
        perDay,
        "Bugünlük kullanım sınırına ulaştın. Yarın kaldığın yerden devam edebilirsin.",
      ),
    };
  }

  // 4) Hesap paylaşımı izi. Engellemiyor, yalnızca kaydediyor.
  if (options.trackSharing) {
    const ipHash = hashIp(requestIp(request));
    if (ipHash) {
      const places = await trackDistinct(
        `cortex:places:${user.id}:${new Date().toISOString().slice(0, 10)}`,
        ipHash,
        86400,
      );
      if (places >= SHARING_THRESHOLD) {
        void recordAbuse({
          signal: "session_spread",
          severity: "medium",
          scope,
          userId: user.id,
          request,
          metadata: { distinctPlaces: places, threshold: SHARING_THRESHOLD },
          // Günde bir kayıt yeter; asıl bilgi "bugün oldu", kaç kez değil.
          dedupeSeconds: 86400,
        });
      }
    }
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
 * Girişi olmayan uçlar için sınır (telefondan yükleme bağlantısı gibi).
 * Sınır aşılmadıysa `null` döner; aşıldıysa doğrudan döndürülecek yanıt.
 */
export async function guestLimit(
  request: Request,
  options: {
    scope: string;
    limit?: number;
    windowSeconds?: number;
    signal?: "rate_limit" | "token_bruteforce";
    severity?: "low" | "medium" | "high";
  },
): Promise<NextResponse | null> {
  const result = await rateLimit(
    clientKey(request, options.scope),
    options.limit ?? 20,
    options.windowSeconds ?? 60,
  );
  if (result.allowed) return null;

  void recordAbuse({
    signal: options.signal ?? "rate_limit",
    severity: options.severity ?? "low",
    scope: options.scope,
    request,
    metadata: { limit: options.limit ?? 20 },
  });
  return tooManyResponse(result);
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
    storage_full:
      "Yükleme alanın doldu. Yeni belge eklemek için eskilerinden birini sil.",
  };
  return NextResponse.json(
    { error: messages[code] ?? "Beklenmeyen bir hata oluştu." },
    { status },
  );
}
