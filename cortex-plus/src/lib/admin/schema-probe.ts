import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";

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
  const [reserve, audio, exam, upgrade, pages, referral, analysisTable] = await Promise.all([
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
  ]);

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
      name: "Deneme üretimi fiyatı",
      ok: exam.data?.credit_cost === 5,
      critical: false,
      detail:
        exam.data?.credit_cost === 5
          ? "5 kredi"
          : `${exam.data?.credit_cost ?? "?"} kredi — 20260918100000 uygulanmamış.`,
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
