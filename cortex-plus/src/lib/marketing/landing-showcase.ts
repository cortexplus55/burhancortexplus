/**
 * Ana sayfanın hedef kitle sekmeleri (7 Kasım 2026).
 *
 * Dört öğrenci profili (lise yazılısı, YKS/LGS, üniversite vize-final, KPSS/TUS/ALES) reklamdan ya da aramadan
 * gelince ilk üç saniyede "burası benim için" demeli. Sekme kahramanın cümlesini ve kayıt bağlantısını
 * (`/kayit?hedef=…`) değiştirir; aşağıdaki 7 adımlı tur (`landing-journey.ts`, 11 Kasım 2026) aynı bağlantıyı kullanır.
 * Eski kayıtsız vitrin (sekmeye göre dört örnek soru) turla birleşti ve kaldırıldı.
 *
 * Pazarlama kuralı (19 Ekim 2026): her cümle bugün üründe çalışan bir şeyi anlatır. Kahraman cümleleri yalnız
 * ücretsiz hesapta da açık olanları sayar; Plus'ta olan özellik turun Plus adımında "Plus" rozetiyle gösterilir
 * (bekçi `marketing-claims.test.ts`).
 */

export const AUDIENCE_SEGMENT_IDS = ["lise", "yks-lgs", "universite", "akademik"] as const;
export type AudienceSegmentId = (typeof AUDIENCE_SEGMENT_IDS)[number];

export type AudienceSegment = {
  id: AudienceSegmentId;
  /** Sekme etiketi (emoji + kısa ad). */
  tab: string;
  /** Kahramanın üst rozeti. */
  badge: string;
  /** Kahramanın alt cümlesi: bu profilin üründe bugün yapabildiği şeyler. */
  lead: string;
  /** Birincil düğme: "{kamp} ücretsiz başlat". */
  ctaLabel: string;
  /** Dönüşüm köprüsündeki kısa ad ("Lise kampını"). */
  campName: string;
  /** Kayıt sayfası bu değeri alınca sınıf ve hedef sınavı önceden seçer (`signup-preset.ts`). */
  signupHref: `/kayit?hedef=${AudienceSegmentId}`;
};

export const AUDIENCE_SEGMENTS: AudienceSegment[] = [
  {
    id: "lise",
    tab: "🎒 Lise & Yazılı",
    badge: "9, 10, 11 ve 12. sınıf · Okul yazılıları ve ortak sınav senaryoları",
    lead: "Hocanın notunu ya da slaytını yükle; yazılıdan önce notuna sadık ders, kartlar ve konu testi hazır olsun.",
    ctaLabel: "Lise kampını ücretsiz başlat",
    campName: "lise kampını",
    signupHref: "/kayit?hedef=lise",
  },
  {
    id: "yks-lgs",
    tab: "🔥 YKS & LGS Kampı",
    badge: "TYT · AYT · LGS",
    lead: "Konu testleri, sınav tuzağı kartları ve \"İki şık arasında kaldım\" ipucuyla her yanlışın nedenini şık şık gör.",
    ctaLabel: "YKS / LGS kampını ücretsiz başlat",
    campName: "YKS / LGS kampını",
    signupHref: "/kayit?hedef=yks-lgs",
  },
  {
    id: "universite",
    tab: "🎓 Üniversite Vize & Final",
    badge: "Tıp · Mühendislik · Hukuk · İİBF · Hocanın slaytı ve PDF'i",
    lead: "Hocanın slaytını ya da PDF'ini yükle; vizeden önce hocanın kendi kuralına sadık anlatım, kartlar ve konu testi çıksın.",
    ctaLabel: "Vize-final kampını ücretsiz başlat",
    campName: "vize-final kampını",
    signupHref: "/kayit?hedef=universite",
  },
  {
    id: "akademik",
    tab: "⚕️ KPSS · TUS · DUS · ALES",
    badge: "KPSS · TUS · DUS · ALES · DGS · YDS · Doğrulanmış hazır müfredat",
    lead: "Dosya yüklemeden, doğrulanmış hazır müfredattan başla: kilit bilgiler, vaka soruları ve hafıza çivileri.",
    ctaLabel: "Sınav kampını ücretsiz başlat",
    campName: "sınav kampını",
    signupHref: "/kayit?hedef=akademik",
  },
];

export const DEFAULT_SEGMENT: AudienceSegmentId = "lise";

export function isAudienceSegmentId(value: unknown): value is AudienceSegmentId {
  return typeof value === "string" && (AUDIENCE_SEGMENT_IDS as readonly string[]).includes(value);
}

export function audienceSegment(id: AudienceSegmentId): AudienceSegment {
  return AUDIENCE_SEGMENTS.find((segment) => segment.id === id) ?? AUDIENCE_SEGMENTS[0]!;
}

/**
 * Adresten sekme: `?hedef=lise|yks-lgs|universite|akademik`; yoksa `utm_campaign` / `utm_content` içindeki anahtar
 * kelime ("yks", "lgs", "tyt", "vize", "kpss", "tus", "lise"…). Hiçbiri yoksa `null` (varsayılan sekme açılır).
 */
export function resolveSegmentParam(search: string | null | undefined): AudienceSegmentId | null {
  if (!search) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return null;
  }
  const direct = params.get("hedef")?.trim().toLocaleLowerCase("tr");
  if (isAudienceSegmentId(direct)) return direct;
  // "kpss_2027", "tyt-kamp" gibi kampanya adlarında ayraçlar boşluk sayılır (alt çizgi kelime sınırı değildir).
  const hint = [params.get("utm_campaign"), params.get("utm_content"), params.get("utm_term")]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr")
    .replace(/[_\-.:/]+/g, " ");
  if (!hint.trim()) return null;
  if (/\b(yks|tyt|ayt|lgs)\b/.test(hint)) return "yks-lgs";
  if (/\b(kpss|tus|dus|ales|dgs|yds)\b/.test(hint)) return "akademik";
  if (/(vize|final|universite|üniversite|fakulte|fakülte)/.test(hint)) return "universite";
  if (/\b(lise|yazili|yazılı|maarif)\b/.test(hint)) return "lise";
  return null;
}
