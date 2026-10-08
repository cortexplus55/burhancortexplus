import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";

/**
 * Canlı şema koddaki beklentiyle uyuşuyor mu.
 *
 * Neden var: 18 Eylül 2026'da bu dal yayına çıktı ve "göç dosyaları
 * uygulandı mı" sorusu DIŞARIDAN cevaplanamadı. Sayfa açılıyor, sitemap 200,
 * `/api/health` "ok" diyor — ama `credit_reserve` eski imzada kalmışsa her
 * kredi ayırma isteği düşüyor. Yani en pahalı arıza, en sessiz görünen arıza.
 *
 * Bu projede göç dosyaları elle uygulanıyor (`docs/delivery/deploy-checklist.md`:
 * repo geçmişi ile uzak veritabanının geçmişi ayrışmış). Elle uygulamanın
 * riski bir dosyanın atlandığının fark edilmemesi; burası o farkı görünür
 * kılıyor.
 */

export type SchemaCheck = {
  name: string;
  ok: boolean;
  detail: string;
  /** Eksikse ürünün bir parçası hiç çalışmıyor. */
  critical: boolean;
};

/**
 * `credit_reserve` miktarlı imzada mı.
 *
 * VAR OLMAYAN bir eylem koduyla soruluyor. Fonksiyonun ikinci adımı kuralı
 * bulamayıp `invalid_action` ile çıkıyor — yani hiçbir satır yazılmıyor,
 * hiçbir kilit alınmıyor, cüzdana dokunulmuyor. Gerçek bir eylem koduyla
 * sormak akışı cüzdan güncellemesine kadar götürürdü ve yazmamasını yalnızca
 * `credit_reservations.user_id` üzerindeki yabancı anahtara borçlu olurduk;
 * bir yoklama tesadüfe dayanmamalı.
 *
 * İmza yoksa PostgREST işlevi bulamıyor (`PGRST202`) — aradığımız fark bu.
 */
async function probeCreditReserve(service: SupabaseClient): Promise<SchemaCheck> {
  const { error } = await service.rpc("credit_reserve", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_action_code: "__schema_probe__",
    p_idempotency_key: "__schema_probe__",
    p_quantity: 1,
  });

  const missing =
    !!error && /could not find the function|PGRST202/i.test(error.message);

  return {
    name: "credit_reserve miktar alıyor",
    ok: !missing,
    critical: true,
    detail: missing
      ? "Eski üç argümanlı imza duruyor — 20260918090000 uygulanmamış. HER kredi ayırma isteği düşüyor."
      : "Yeni imza yerinde.",
  };
}

/**
 * İade fonksiyonu yerinde mi. Boş argümanla sorulur: fonksiyon ilk satırda
 * `missing_args` döner, hiçbir satıra dokunmaz. Yoksa PostgREST bulamaz.
 */
async function probeRefundFunction(service: SupabaseClient): Promise<boolean> {
  const { error } = await service.rpc("apply_payment_refund", {
    p_payment_id: null,
    p_refund_kurus: null,
    p_provider_ref: null,
    p_source: "schema_probe",
  });
  return !(error && /could not find the function|PGRST202/i.test(error.message));
}

async function hasTable(
  service: SupabaseClient,
  table: string,
): Promise<boolean> {
  const { error } = await service.from(table).select("user_id").limit(1);
  return !error;
}

export async function probeSchema(
  service: SupabaseClient,
): Promise<SchemaCheck[]> {
  const teacherAnalysis = service
    .from("document_teacher_analyses")
    .select("document_id")
    .limit(1);
  const [reserve, audio, exam, upgrade, pages, referral, analysisTable, podcastRule, chatRule, failures, refundFn, preview, prefetch] = await Promise.all([
    probeCreditReserve(service),
    service
      .from("credit_rules")
      .select("credit_cost")
      .eq("action_code", "AUDIO_SYNTHESIZE")
      .maybeSingle(),
    service
      .from("credit_rules")
      .select("credit_cost")
      .eq("action_code", "PRACTICE_EXAM_GENERATE")
      .maybeSingle(),
    hasTable(service, "model_upgrade_grants"),
    hasTable(service, "document_page_grants"),
    service
      .from("referral_tiers")
      .select("multiplier")
      .eq("status", "subscribed")
      .maybeSingle(),
    teacherAnalysis,
    service.from("credit_rules").select("credit_cost").eq("action_code", "PODCAST_GENERATE").maybeSingle(),
    service.from("credit_rules").select("credit_cost").eq("action_code", "AI_CHAT_STANDARD").maybeSingle(),
    hasTable(service, "lesson_generation_failures"),
    probeRefundFunction(service),
    hasTable(service, "admin_free_preview"),
    hasTable(service, "exam_prep_prefetch"),
  ]);
  const examPrice = CREDIT_PRICE_TABLE.PRACTICE_EXAM_GENERATE.credits;
  const chatPrice = CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits;
  const v2 = Boolean(podcastRule.data) && chatRule.data?.credit_cost === chatPrice;

  const referralMultiplier = referral.data?.multiplier as number | undefined;

  return [
    reserve,
    {
      name: "Seslendirme kredi kuralı",
      ok: Boolean(audio.data),
      critical: true,
      detail: audio.data
        ? `${audio.data.credit_cost} kredi / 900 karakter`
        : "AUDIO_SYNTHESIZE kuralı yok — ses ücretsiz üretiliyor (20260918090000).",
    },
    {
      // 8 Ekim 2026: yeni işlem kodları yoksa podcast, sözlü ve sesli sohbet
      // `invalid_action` ile düşer — kritik.
      name: "Kredi sistemi v2",
      ok: v2,
      critical: true,
      detail: v2
        ? `Mesaj ${chatPrice}, ders ${CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits}, podcast ${CREDIT_PRICE_TABLE.PODCAST_GENERATE.credits} kredi`
        : "20261008120000 uygulanmamış — podcast, sözlü ve sesli sohbet düşer.",
    },
    {
      name: "Deneme üretimi fiyatı",
      ok: exam.data?.credit_cost === examPrice,
      critical: false,
      detail:
        exam.data?.credit_cost === examPrice
          ? `${examPrice} kredi`
          : `${exam.data?.credit_cost ?? "?"} kredi — 20261008120000 uygulanmamış.`,
    },
    {
      name: "Ders hatası kaydı",
      ok: failures,
      critical: false,
      detail: failures
        ? "lesson_generation_failures yerinde"
        : "Tablo yok — Ders hataları sayfası boş kalır (20260928010000).",
    },
    {
      name: "İade fonksiyonu",
      ok: refundFn,
      critical: false,
      detail: refundFn
        ? "apply_payment_refund yerinde (kilitli, tek işlemde iade)"
        : "Yok — iade kod yolundan yürür, eşzamanlılık koruması zayıf (20260928030000).",
    },
    {
      name: "Ücretsiz önizleme ve önceden hazırlama",
      ok: preview && prefetch,
      critical: false,
      detail: preview && prefetch
        ? "admin_free_preview ve exam_prep_prefetch yerinde"
        : "Tablo eksik (20261008100000 / 20261003100000).",
    },
    {
      name: "Zor soru tavanı sayacı",
      ok: upgrade,
      critical: false,
      detail: upgrade
        ? "model_upgrade_grants yerinde"
        : "Tablo yok — yükseltme tavanı kapalıya düşüyor (20260918110000).",
    },
    {
      name: "Fotoğraf sayfası sayacı",
      ok: pages,
      critical: false,
      detail: pages
        ? "document_page_grants yerinde"
        : "Tablo yok — fotoğraf ve taranmış PDF reddediliyor (20260918120000).",
    },
    {
      name: "Davet çarpanı",
      ok: typeof referralMultiplier === "number" && referralMultiplier < 400,
      critical: false,
      detail:
        typeof referralMultiplier === "number"
          ? `${referralMultiplier} kat`
          : "Okunamadı (20260918130000).",
    },
    {
      name: "Öğretmen analizi kaydı",
      ok: !analysisTable.error,
      critical: false,
      detail: analysisTable.error
        ? "document_teacher_analyses yok — yeni yükleme analiz satırı yazamıyor (20260924200000)."
        : "document_teacher_analyses yerinde. Hazır satır yüklemede bir kez yazılır.",
    },
  ];
}

/*
  `/api/health` herkese açık ve kimlik istemiyor. Her istekte veritabanına
  altı sorgu atmak, ölçmek istediğimiz şeyi kendimiz bozmak olurdu; sonuç
  kısa süre tutuluyor.

  Sunucusuz ortamda her örneğin kendi belleği var, yani bu bir paylaşımlı
  önbellek değil — örnek başına yükü sınırlıyor, yeter olan da bu.
*/
const CACHE_MS = 60_000;
let cached: { at: number; ok: boolean } | null = null;

/**
 * Tek satırlık cevap: şema koddaki beklentiyle uyuşuyor mu.
 *
 * Ayrıntı DÖNMÜYOR. Herkese açık uçta hangi tablonun eksik olduğunu söylemek
 * gereksiz bilgi verir; "uyuşuyor / uyuşmuyor" sorunun tamamını cevaplıyor,
 * gerisi `/admin/sistem`'de.
 */
export async function schemaMatchesCode(): Promise<boolean | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ok;

  try {
    const checks = await probeSchema(createServiceClient());
    const ok = checks.filter((c) => c.critical).every((c) => c.ok);
    cached = { at: Date.now(), ok };
    return ok;
  } catch {
    // Service anahtarı yoksa ya da veritabanına ulaşılamıyorsa "bilmiyorum"
    // diyoruz. `false` demek yanlış alarm olurdu; bir durum ekranının en
    // kötü hâli yanlış bilgi vermesidir.
    return null;
  }
}
