/**
 * Ana sayfanın hedef kitle profilleri (7 Kasım 2026).
 *
 * Bir öğrenci profili reklamdan ya da aramadan gelince ilk üç saniyede "burası benim için" demeli. Profil kahramanın
 * cümlesini ve kayıt bağlantısını (`/kayit?hedef=…`) değiştirir; 7 adımlı tur (`landing-journey.ts`) aynı bağlantıyı
 * kullanır.
 *
 * Faz 7 (20 Kasım 2026): tur profilin branşıyla oynanır (`guest-demo-tracks.ts`).
 *
 * Faz 9 (20 Kasım 2026, ürün sahibi: "iki ayrı seçici kafa karıştırıyor"): kahramandaki dört sekme ile turun branş
 * şeridi TEK seçicide birleşti (`HERO_PICKS`, `guest-demo-tracks.ts`). Seçicide dört seçenek var, profil beş: lise ve
 * YKS/LGS aynı seçeneğe ("Lise & YKS") düşer ama eski bağlantının profili (`?hedef=yks-lgs`) kayıt bağlantısında korunur.
 * TUS kendi profili oldu (önce akademik sekmenin içindeydi): kendi cümlesi, kendi düğmesi, kayıtta "TUS hazırlık".
 *
 * Pazarlama kuralı (19 Ekim 2026): her cümle bugün üründe çalışan bir şeyi anlatır. Kahraman cümleleri yalnız
 * ücretsiz hesapta da açık olanları sayar; Plus'ta olan özellik turun Plus adımında "Plus" rozetiyle gösterilir
 * (bekçi `marketing-claims.test.ts`).
 */

export const AUDIENCE_SEGMENT_IDS = ["lise", "yks-lgs", "universite", "akademik", "tus"] as const;
export type AudienceSegmentId = (typeof AUDIENCE_SEGMENT_IDS)[number];

export type AudienceSegment = {
  id: AudienceSegmentId;
  /** Kahramanın alt cümlesi: bu profilin üründe bugün yapabildiği şeyler. */
  lead: string;
  /** Birincil düğme: "{kamp} ücretsiz başlat". */
  ctaLabel: string;
  /** Kayıt sayfası bu değeri alınca sınıf ve hedef sınavı önceden seçer (`signup-preset.ts`). */
  signupHref: `/kayit?hedef=${AudienceSegmentId}`;
  /** Yol haritasındaki hedef çipinin ilk sözcüğü: "Yazılına 7 gün var". */
  examWord: string;
};

export const AUDIENCE_SEGMENTS: AudienceSegment[] = [
  {
    id: "lise",
    lead: "Hocanın notunu ya da slaytını yükle; yazılıdan önce notuna sadık ders, kartlar ve konu testi hazır olsun.",
    ctaLabel: "Lise kampını ücretsiz başlat",
    signupHref: "/kayit?hedef=lise",
    examWord: "Yazılına",
  },
  {
    id: "yks-lgs",
    lead: "Konu testleri, sınav tuzağı kartları ve \"İki şık arasında kaldım\" ipucuyla her yanlışın nedenini şık şık gör.",
    ctaLabel: "YKS / LGS kampını ücretsiz başlat",
    signupHref: "/kayit?hedef=yks-lgs",
    examWord: "Sınavına",
  },
  {
    id: "universite",
    lead: "Hocanın slaytını ya da PDF'ini yükle; vizeden önce hocanın kendi kuralına sadık anlatım, kartlar ve konu testi çıksın.",
    ctaLabel: "Vize-final kampını ücretsiz başlat",
    signupHref: "/kayit?hedef=universite",
    examWord: "Vizene",
  },
  {
    id: "akademik",
    lead: "Dosya yüklemeden, doğrulanmış hazır müfredattan başla: kilit bilgiler, vaka soruları ve hafıza çivileri.",
    ctaLabel: "Sınav kampını ücretsiz başlat",
    signupHref: "/kayit?hedef=akademik",
    examWord: "Sınavına",
  },
  {
    id: "tus",
    lead: "Tıp notunu ya da ders slaytını yükle; TUS'tan önce notuna sadık anlatım, sınav tuzağı kartları ve vaka soruları hazır olsun.",
    ctaLabel: "TUS kampını ücretsiz başlat",
    signupHref: "/kayit?hedef=tus",
    examWord: "Sınavına",
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
 * Adresten profil: `?hedef=lise|yks-lgs|universite|akademik|tus`; yoksa `utm_campaign` / `utm_content` / `utm_term`
 * içindeki anahtar kelime ("yks", "lgs", "tyt", "tus", "dus", "kpss", "vize", "lise"…). Hiçbiri yoksa `null`
 * (varsayılan profil açılır). Eski bağlantılar çalışmaya devam eder: dört eski profil aynı adla duruyor.
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
  if (/\b(tus|dus)\b/.test(hint)) return "tus";
  if (/\b(kpss|ales|dgs|yds)\b/.test(hint)) return "akademik";
  if (/(vize|final|universite|üniversite|fakulte|fakülte)/.test(hint)) return "universite";
  if (/\b(lise|yazili|yazılı|maarif)\b/.test(hint)) return "lise";
  return null;
}
