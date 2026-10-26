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
 * `credit_reserve_metered` yerinde mi (24 Ekim 2026, kredi v3). Ücretsiz hesabın her ayırması bu
 * fonksiyondan geçer; yoksa kod sessizce sayaçsız `credit_reserve`'e düşer (`reserveCredits`). Tablo ya
 * da fiyat satırına bakmak yetmiyor: 20261024121000 yarım kalırsa (tablo var, bu fonksiyon yok) öteki
 * satırlar yeşil görünür.
 *
 * `probeCreditReserve` gibi VAR OLMAYAN bir eylem koduyla ve sayaçsız (`p_meter: null`) sorulur: sıfır
 * kimlik abone ya da yönetici değil, iş Plus'a özel değil; sayaçsız iş `credit_reserve`'e gider ve orada
 * `invalid_action` ile çıkar — hiçbir satır yazılmaz. Herhangi bir iş hatası fonksiyonun çalıştığını
 * kanıtlar; yalnız PostgREST işlevi bulamazsa (`PGRST202`) eksik.
 */
async function probeMeteredReserve(service: SupabaseClient): Promise<SchemaCheck> {
  const { error } = await service.rpc("credit_reserve_metered", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_action_code: "__schema_probe__",
    p_idempotency_key: "schema-probe",
    p_quantity: 1,
    p_meter: null,
  });

  const missing =
    !!error && ((error as { code?: string }).code === "PGRST202" || /could not find the function|PGRST202/i.test(error.message));

  return {
    name: "Ücretsiz sayaçlı ayırma",
    ok: !missing,
    critical: true,
    detail: missing
      ? "credit_reserve_metered yok — 20261024121000 uygulanmamış ya da yarım kalmış. Ücretsiz hesabın ayırmaları sayaçsız credit_reserve'e düşüyor: haftada 3 ders, günde 3 mesaj, 1 fotoğraf çalışmıyor."
      : "credit_reserve_metered yerinde: ücretsiz hesap sayaçla ayırıyor.",
  };
}

/**
 * 20261024123000 (ücretsiz günlük kredi 0) uygulandı mı. Fiyat (20261024120000) ve `free_usage`
 * (20261024121000) bunu söylemez: (c) yarım yapıştırılırsa v2 `credit_reserve` canlıda kalır (ücretsiz
 * günde 6, davetliye 18, abonede davet çarpanı, yeni cüzdan 50) ve satır yine yeşil görünürdü.
 *
 * `unverified_allowance()` argümansız, salt okunur bir SQL fonksiyonu (`SELECT n`); yetkisi hiç
 * daraltılmadı (PUBLIC), sunucu rolü çağırabilir. v2'de 6, bu göçle 0, geri alma dosyasıyla yeniden 6.
 * Okunamazsa `null`: bilinmeyen durum yeşil sayılmaz.
 */
async function probeFreeDailyZero(service: SupabaseClient): Promise<number | null> {
  const { data, error } = await service.rpc("unverified_allowance");
  if (error) return null;
  // Boş cevap 0 sayılmasın (Number(null) === 0).
  const value = typeof data === "number" ? data : typeof data === "string" && data.trim() ? Number(data) : NaN;
  return Number.isFinite(value) ? value : null;
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

/**
 * Sonuca göre yol fonksiyonu yerinde mi (20 Ekim 2026). Boş argümanla sorulur: güncelleme hiçbir
 * satırı tutmaz, ekleme zorunlu alanda düşer ve işlem geri alınır. Yoksa PostgREST bulamaz.
 */
async function probePathInsert(service: SupabaseClient): Promise<boolean> {
  const { error } = await service.rpc("exam_path_insert_after", {
    p_prep_id: null,
    p_after_sort: null,
    p_kind: null,
    p_title: null,
    p_day_index: null,
    p_session_meta: null,
  });
  return !(error && /could not find the function|PGRST202/i.test(error.message));
}

/**
 * Podcast önbelleğinin dinleme kontrolü sütunu (20 Ekim 2026). Yalnız sütun yoksa kırmızı: kod
 * göçsüz de çalışır, önbellekteki podcast o zaman kontrolsüz (puansız) açılır.
 */
async function probeListeningCheckColumn(service: SupabaseClient): Promise<boolean> {
  const { error } = await service.from("exam_prep_podcasts").select("listening_check").limit(1);
  const code = (error as { code?: string } | null)?.code;
  return !(code === "42703" || code === "PGRST204");
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
  const [reserve, audio, exam, upgrade, pages, referral, analysisTable, podcastRule, chatRule, failures, refundFn, preview, prefetch, pathInsert, listeningCheck, reviewItems, metered] = await Promise.all([
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
    probePathInsert(service),
    probeListeningCheckColumn(service),
    hasTable(service, "exam_prep_review_items"),
    probeMeteredReserve(service),
  ]);
  // Kredi v3 + sayıya dayalı ücretsiz katman (24 Ekim 2026): göçler uygulanmadıysa ücretsiz hesap hiçbir
  // işi açamaz (günlük kredi 0, sayaç tablosu yok) — kritik. Yeşil yalnız üçü birden tutunca: ders fiyatı
  // (20261024120000), free_usage (20261024121000) ve günlük kredi 0 (20261024123000). Sayaç fonksiyonu
  // ayrıca soruluyor (`probeMeteredReserve`).
  const [lessonRule, freeUsage, dailyAllowance] = await Promise.all([
    service.from("credit_rules").select("credit_cost").eq("action_code", "STUDY_PLAN_GENERATE").maybeSingle(),
    hasTable(service, "free_usage"),
    probeFreeDailyZero(service),
  ]);
  const lessonPrice = CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits;
  const dailyZero = dailyAllowance === 0;
  const v3 = lessonRule.data?.credit_cost === lessonPrice && freeUsage && dailyZero;
  // Yanılgı çözümü (20 Ekim 2026): sütun yoksa sayımlar eski davranışta, hepsi açık sayılır.
  const misconceptionResolution = await service
    .from("exam_prep_misconceptions")
    .select("resolved_at")
    .limit(1);
  const [explainAttempts, prepVideos] = await Promise.all([
    hasTable(service, "explain_attempts"),
    hasTable(service, "prep_videos"),
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
      name: "Kredi v3 ve ücretsiz sayaçlar",
      ok: v3,
      critical: true,
      detail: v3
        ? `Ders ${lessonPrice}, test ${CREDIT_PRICE_TABLE.QUIZ_GENERATE.credits}, mesaj ${chatPrice} kredi; ücretsiz haftada 3 ders, günde 3 mesaj, 1 fotoğraf; günlük kredi 0`
        : `Ders ${lessonRule.data?.credit_cost ?? "?"} kredi${freeUsage ? "" : ", free_usage yok"}${
            dailyZero ? "" : `, günlük ücretsiz kredi ${dailyAllowance ?? "okunamadı"} (0 olmalı: 20261024123000)`
          }. Sıra: 20261024121000 koddan önce; 20261024120000 ve 20261024123000 koddan sonra, tek çalıştırmada.`,
    },
    metered,
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
      name: "Sonuca göre yol",
      ok: pathInsert,
      critical: false,
      detail: pathInsert
        ? "exam_path_insert_after yerinde: düşük sonuçta konunun odaklı pratiği araya girer"
        : "Fonksiyon yok — düşük sonuçta odaklı pratik eklenmez (20261020120000).",
    },
    {
      name: "Dinleme kontrolü önbelleği",
      ok: listeningCheck,
      critical: false,
      detail: listeningCheck
        ? "exam_prep_podcasts.listening_check yerinde: önbellekten gelen podcast de kontrollü açılır"
        : "Sütun yok — önbellekteki podcast dinleme kontrolsüz (puansız) açılır (20261020150000).",
    },
    {
      name: "Aralıklı tekrar kaydı",
      ok: reviewItems,
      critical: false,
      detail: reviewItems
        ? "exam_prep_review_items yerinde: kaçırılan soru 1-3-7-14 gün sonra yeniden sorulur"
        : "Tablo yok — tekrar yazılmıyor, \"Bugün N tekrar\" görünmüyor, hesap silme bu adımda düşer (20261020160000).",
    },
    {
      name: "Yanılgı çözümü",
      ok: !misconceptionResolution.error,
      critical: false,
      detail: misconceptionResolution.error
        ? "20261020170000 uygulanmamış: açık yanılgılar sayımı eski davranışta (hepsi açık)."
        : "resolved_at yerinde: iki ayrı günde doğru cevaplanan konunun yanılgısı kapanır",
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
    {
      name: "Anlatım geçmişi",
      ok: explainAttempts,
      critical: false,
      detail: explainAttempts
        ? "explain_attempts yerinde (20261025120000)."
        : "Tablo yok — anlatım geçmişi sessizce boş kalır (20261025120000).",
    },
    {
      name: "Video görsel stilleri",
      ok: prepVideos,
      critical: false,
      detail: prepVideos
        ? "prep_videos okunuyor. Yeni stil listesi salt okumayla doğrulanamaz (20261025121000)."
        : "Tablo yok — video ders kaydı yazılamaz (20261017150000 / 20261025121000).",
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
