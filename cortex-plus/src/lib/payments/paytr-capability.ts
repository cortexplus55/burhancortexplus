import crypto from "crypto";
import { isPaytrConfigured, paytrConfig } from "@/lib/payments/paytr";

/**
 * Abonelik otomatik yenilenebilir mi?
 *
 * Soru iki parçalı ve ikisi de burada cevaplanıyor:
 *
 * 1. MAĞAZADA YETKİ VAR MI — PayTR'ye sorulur (`probePaytrRecurring`).
 * 2. ENTEGRASYONUMUZ BUNU TAŞIYOR MU — koddan bilinir (`RECURRING_BLOCKERS`).
 *
 * İkincisi olmadan birincisi yanıltıcı: yetki açık olsa bile bugün kart
 * saklanamıyor, çünkü kullandığımız iFrame API'nin kart saklama parametresi
 * YOK. PayTR dokümanı (dev.paytr.com, 17 Eylül 2026'da okundu) kart saklamayı
 * yalnızca Direkt API altında tanımlıyor:
 *
 *   - Kart saklama: `POST /odeme` + `store_card`, kart numarası ve CVV'yi
 *     BİZİM sunucumuz gönderir (Direkt API).
 *   - Tekrarlayan tahsilat: `POST /odeme` + `non_3d=1` + `recurring_payment=1`
 *     + `utoken` + `ctoken`; utoken/ctoken CAPI LIST'ten gelir.
 *   - Non3D yetkisi mağazaya ayrıca talep edilerek tanımlanıyor.
 *
 * Yani otomatik yenilemenin önündeki engel yalnızca izin değil, mimari:
 * kart verisini kendi sunucumuzdan geçirmek PCI-DSS kapsamı demek. Bu
 * dosyanın işi o gerçeği görünür tutmak — "yetki alındı" ile "otomatik
 * yenileme çalışır" aynı şey sanılmasın.
 *
 * Neden önemli: yetkinin olduğu sanılıp sözleşmeye "otomatik yenilenir"
 * yazılırsa, abonelik sessizce biter ve vaat edilen tahsilat hiç olmaz.
 * Sözleşmede söz verilip üründe yapılmayan şey, hiç söz vermemekten kötü.
 */

/** Tek kaynak: ürün bugün otomatik yenileme yapabiliyor mu. */
export const AUTO_RENEW_SUPPORTED = false;

/**
 * Otomatik yenilemenin önündeki engeller — sırayla aşılması gerekenler.
 *
 * Liste yönetim panelinde görünüyor ve testler hukuki metinle bağlıyor:
 * engeller durdukça sözleşme "otomatik yenilenmez" demeye devam ediyor.
 */
export const RECURRING_BLOCKERS: { title: string; detail: string }[] = [
  {
    title: "Kart saklama iFrame API'de yok",
    detail:
      "Kart ancak Direkt API ile saklanıyor; kullandığımız iFrame API'de store_card parametresi bulunmuyor.",
  },
  {
    title: "Direkt API kart verisini bizden geçiriyor",
    detail:
      "Kart numarası ve CVV kendi sunucumuzdan PayTR'ye gidiyor; bu PCI-DSS kapsamı ve ayrı bir karar.",
  },
  {
    title: "Non3D yetkisi ayrıca talep ediliyor",
    detail:
      "Tekrarlayan tahsilat non_3d=1 ile çalışıyor ve bu yetki mağazaya PayTR'den istenerek tanımlanıyor.",
  },
];

export type PaytrCapability = {
  /** Anahtarlar tanımlı mı. */
  configured: boolean;
  /** Kart saklama servisi bu mağazaya açık mı. */
  recurring: "unknown" | "available" | "unavailable";
  /** Panelde gösterilecek insan okunur açıklama. */
  detail: string;
};

const CAPI_LIST_URL = "https://www.paytr.com/odeme/capi/list";

/** Hiçbir kullanıcıya ait olmayan sorgu anahtarı. */
const PROBE_UTOKEN = "cortexplus-capability-probe";

/**
 * Kart saklama servisine kayıtlı kart listesi soruyor.
 *
 * Bu çağrı PARA HAREKETİ YAPMIYOR: yalnızca okuma, hem de var olmayan bir
 * kullanıcı için. Amaç kart listesi almak değil, servisin bu mağazaya AÇIK
 * olup olmadığını öğrenmek. Kayıt bulunmadığında PayTR boş JSON dönüyor —
 * bu "servis çalıştı" demek ve aradığımız sinyal bu.
 *
 * İmza dışında hiçbir gizli değer gönderilmiyor: merchant_key ve
 * merchant_salt istek gövdesine GİRMİYOR, yalnızca HMAC'in içinde kalıyor.
 */
export async function probePaytrRecurring(
  fetchImpl: typeof fetch = fetch,
): Promise<PaytrCapability> {
  if (!isPaytrConfigured()) {
    return {
      configured: false,
      recurring: "unknown",
      detail: "PayTR anahtarları tanımlı değil; yetki sorgulanamıyor.",
    };
  }

  const config = paytrConfig();
  /*
    Hash formülü PayTR dokümanından birebir: hash_str = utoken + merchant_salt
    ve paytr_token = base64(HMAC-SHA256(hash_str, merchant_key)).

    Buraya merchant_id EKLENMEZ. Eklendiğinde PayTR isteği imza hatasıyla
    reddediyor ve cevap `{"status":"error",...}` oluyor; "status" kelimesine
    bakan bir okuma bunu BAŞARI sanıyor. Yani yanlış formül, tam olarak
    kaçınmaya çalıştığımız sonucu üretiyor: yetki yokken "yetki var".
  */
  const token = crypto
    .createHmac("sha256", config.merchantKey)
    .update(`${PROBE_UTOKEN}${config.merchantSalt}`)
    .digest("base64");

  try {
    const response = await fetchImpl(CAPI_LIST_URL, {
      method: "POST",
      body: new URLSearchParams({
        merchant_id: config.merchantId,
        utoken: PROBE_UTOKEN,
        paytr_token: token,
      }),
      // Yoklama yönetim panelinin açılışını bekletmemeli.
      signal: AbortSignal.timeout(8000),
    });

    const text = await response.text();
    return readProbeResponse(response.status, text);
  } catch (error) {
    return {
      configured: true,
      recurring: "unknown",
      detail:
        "PayTR'ye ulaşılamadı: " +
        (error instanceof Error ? error.message : "bilinmeyen hata"),
    };
  }
}

/** Yetki hatası olduğunu söyleyen ifadeler. */
const DENIED_HINTS = ["yetki", "izin", "tanımlı değil", "not authorized", "permission"];

/**
 * Yanıtı okuyup yetki durumuna çeviriyor.
 *
 * Ayrı bir fonksiyon çünkü asıl karar burası ve ağ olmadan test edilebilmesi
 * gerekiyor. Kural: BELİRSİZLİK ASLA "açık" OKUNMAZ. Yanlış "kapalı" okumanın
 * bedeli gereksiz bir uyarı; yanlış "açık" okumanın bedeli sözleşmeye
 * tutulamayacak bir söz yazmak.
 *
 * PayTR yanıtları (doküman: kayıtlı kart listesi):
 *   - kayıt yok            -> boş JSON        -> servis açık
 *   - kayıtlı kart var     -> ctoken'lı dizi  -> servis açık
 *   - hata                 -> {"status":"error","err_msg":"..."}
 */
export function readProbeResponse(status: number, body: string): PaytrCapability {
  const trimmed = body.trim();
  const lower = trimmed.toLowerCase();

  if (DENIED_HINTS.some((hint) => lower.includes(hint))) {
    return {
      configured: true,
      recurring: "unavailable",
      detail:
        "Kart saklama / tekrarlayan tahsilat yetkisi kapalı. PayTR'den Direkt API, " +
        "kart saklama ve Non3D yetkisi talep edilmeli.",
    };
  }

  if (status !== 200) {
    return {
      configured: true,
      recurring: "unknown",
      detail: `PayTR yanıt vermedi (HTTP ${status}). Panelden elle doğrulanmalı.`,
    };
  }

  /*
    Sıfır uzunluklu gövde açık sayılmıyor. Doküman "kayıt yoksa boş JSON"
    diyor; bu `{}` ya da `[]` demek. Tamamen boş bir gövde ise vekil sunucu,
    kesilmiş bağlantı ya da engellenmiş istek de olabilir — belirsiz.
  */
  if (!trimmed) {
    return {
      configured: true,
      recurring: "unknown",
      detail: "PayTR boş yanıt döndü; panelden elle doğrulanmalı.",
    };
  }

  // Boş JSON = "bu kullanıcının kartı yok" demek; servis çalışmış.
  if (trimmed === "{}" || trimmed === "[]") {
    return {
      configured: true,
      recurring: "available",
      detail:
        "Kart saklama servisi bu mağazaya açık (sorgu işlendi, kayıt yok). " +
        "Tekrarlayan tahsilat için Direkt API'ye geçmek yine gerekiyor.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      configured: true,
      recurring: "unknown",
      detail: "PayTR yanıtı JSON değil; panelden elle doğrulanmalı.",
    };
  }

  /*
    Hata cevabı da JSON ve içinde "status" geçiyor. Kelimeye değil DEĞERE
    bakılıyor: `status: "error"` başarı sayılamaz.
  */
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (record.status === "error") {
      const message =
        typeof record.err_msg === "string" && record.err_msg.trim()
          ? record.err_msg.trim()
          : "gerekçe bildirilmedi";
      return {
        configured: true,
        recurring: "unknown",
        detail: `PayTR isteği reddetti: ${message}. Yetkiyle ilgili olmayabilir (imza, mağaza no); panelden doğrulanmalı.`,
      };
    }
    // Açık başarı değeri: kelimeye değil değere bakılıyor.
    if (record.status === "success") {
      return {
        configured: true,
        recurring: "available",
        detail:
          "Kart saklama servisi bu mağazaya açık. Tekrarlayan tahsilat için " +
          "Direkt API'ye geçmek yine gerekiyor.",
      };
    }
  }

  // Kayıtlı kart listesi bir dizi olarak dönüyor.
  if (Array.isArray(parsed)) {
    return {
      configured: true,
      recurring: "available",
      detail:
        "Kart saklama servisi bu mağazaya açık. Tekrarlayan tahsilat için " +
        "Direkt API'ye geçmek yine gerekiyor.",
    };
  }

  return {
    configured: true,
    recurring: "unknown",
    detail: `PayTR yanıtı yorumlanamadı (HTTP ${status}). Panelden elle doğrulanmalı.`,
  };
}
