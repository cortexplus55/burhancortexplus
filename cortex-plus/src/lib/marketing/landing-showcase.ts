/**
 * Ana sayfanın hedef kitle sekmeleri ve kayıtsız "aha" vitrini (7 Kasım 2026).
 *
 * Dört öğrenci profili (lise yazılısı, YKS/LGS, üniversite vize-final, KPSS/TUS/ALES) reklamdan ya da aramadan
 * gelince ilk üç saniyede "burası benim için" demeli. Sekme hem kahramanın cümlelerini hem aşağıdaki canlı
 * vitrini hem de kayıt bağlantısını (`/kayit?hedef=…`) değiştirir.
 *
 * Vitrin kesinlikle model çağırmaz: dört kısa, genel ve doğrulanabilir örnek burada yazılı; ziyaretçi şıkka dokunur,
 * "İki şık arasında kaldım" ipucunu açar, cevabı ve koç tepkisini anında görür. Örnekler evrensel matematik ve
 * istatistik kurallarıdır (canlı denemelerin konu, kişi ya da sayı örnekleri değil — bekçi `src-senaryo-sabitleri`).
 * Pazarlama kuralı (19 Ekim 2026) burada da geçerli: her cümle bugün üründe çalışan bir şeyi anlatır; Plus'ta olan
 * özellik "Plus" diye söylenir (bekçi `marketing-claims.test.ts`).
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
    lead:
      "Hocanın notunu ya da slaytını yükle; yazılıdan önce notuna birebir sadık ders, konu testi ve yazılı provası çıksın. Notun yoksa hazır müfredattan ve ortak yazılı senaryolarından çalışırsın.",
    ctaLabel: "Lise kampını ücretsiz başlat",
    campName: "lise kampını",
    signupHref: "/kayit?hedef=lise",
  },
  {
    id: "yks-lgs",
    tab: "🔥 YKS & LGS Kampı",
    badge: "TYT · AYT · LGS",
    lead:
      "Yeni nesil sorularla konu testi, yanlışa \"İki şık arasında kaldım\" ipucu, sınav tuzağı kartları ve seviye tespitiyle tahmini net. Her yanlışın neden yanlış olduğunu şık şık görürsün.",
    ctaLabel: "YKS / LGS kampını ücretsiz başlat",
    campName: "YKS / LGS kampını",
    signupHref: "/kayit?hedef=yks-lgs",
  },
  {
    id: "universite",
    tab: "🎓 Üniversite Vize & Final",
    badge: "Tıp · Mühendislik · Hukuk · İİBF · Hocanın slaytı ve PDF'i",
    lead:
      "Hocanın 80 sayfalık slaytını, PDF'ini ya da çıkmış sorularını yükle; hocanın kendi kuralına sadık konu anlatımı, sınav sabahı kâğıdı ve çıkmış sorulara göre ikiz sınav çıksın.",
    ctaLabel: "Vize-final kampını ücretsiz başlat",
    campName: "vize-final kampını",
    signupHref: "/kayit?hedef=universite",
  },
  {
    id: "akademik",
    tab: "⚕️ KPSS · TUS · DUS · ALES",
    badge: "KPSS · TUS · DUS · ALES · DGS · YDS · Doğrulanmış hazır müfredat",
    lead:
      "Dosya yüklemeden, doğrulanmış hazır müfredattan tek tıkla başla: kilit bilgiler, vaka soruları, hafıza çivileri ve Plus'ta bir dakikalık çizimli videolar. Zaman kaybetmeden net artır.",
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

/* ---------- Canlı vitrin: ders önizlemesi + soru ---------- */

export type ShowcaseCase = {
  /** Konu adı (ürünün ders ekranındaki başlık gibi). */
  topic: string;
  /** Sınav etiketi ("10. sınıf · Matematik"). */
  level: string;
  /** Kavram / formül özeti (ürünün formül kartı). */
  formula: { title: string; expression: string; note: string };
  /** Sınav tuzağı kartı: ürünün `exam_trap_card` bloğuyla aynı alanlar. */
  trap: { title: string; wrong: string; right: string; tell: string };
  /** Hafıza çivisi: ürünün `memory_hook_card` bloğuyla aynı alanlar. */
  hook: { kind: "analogy" | "image" | "shortcut"; title: string; body: string };
  question: {
    prompt: string;
    /** Lise/YKS/üniversite/akademik: 5 şık (A–E); LGS'de 4 olurdu — vitrin örnekleri 5 şıklı. */
    options: string[];
    answer: string;
    explanation: string;
    steps: string[];
    /** "İki şık arasında kaldım": en çok karıştırılan iki şık ve aralarındaki farkı hatırlatan tek cümle (cevabı söylemez). */
    twoOption: { pair: [string, string]; hint: string };
  };
};

export const SHOWCASE: Record<AudienceSegmentId, ShowcaseCase> = {
  lise: {
    topic: "Mutlak değer denklemleri",
    level: "9. sınıf · Matematik",
    formula: {
      title: "Mutlak değerli denklem iki denkleme açılır",
      expression: "|x − a| = b  (b > 0)  ⇒  x − a = b  ya da  x − a = −b",
      note: "İki kök çıkar; soru 'köklerin toplamı' diyorsa ikisini de bulmadan toplama geçme.",
    },
    trap: {
      title: "Tek kök tuzağı",
      wrong: "|x − 3| = 5 ise x = 8'dir; başka kök yoktur.",
      right: "Mutlak değer iki yönlü açılır: x − 3 = 5 ya da x − 3 = −5. Kökler 8 ve −2.",
      tell: "Soru 'köklerin toplamı' ya da 'çözüm kümesi' diyorsa iki kök arıyordur.",
    },
    hook: {
      kind: "image",
      title: "İki kapılı ev",
      body: "Mutlak değer işareti iki kapılı bir ev gibi: içerideki sayı hem artı kapıdan hem eksi kapıdan çıkar. Tek kapıdan çıkan çözüm eksiktir.",
    },
    question: {
      prompt: "|x − 3| = 5 denkleminin köklerinin toplamı kaçtır?",
      options: ["−2", "6", "8", "10", "16"],
      answer: "6",
      explanation: "İki kök vardır: 8 ve −2. Toplamları 8 + (−2) = 6.",
      steps: ["x − 3 = 5 ⇒ x = 8", "x − 3 = −5 ⇒ x = −2", "Toplam: 8 + (−2) = 6"],
      twoOption: {
        pair: ["6", "8"],
        hint: "Mutlak değer denklemi iki denkleme açılır: x − 3 = 5 ve x − 3 = −5. Toplamı sormadan önce iki kökü de yazdın mı?",
      },
    },
  },
  "yks-lgs": {
    topic: "Yüzde problemleri · Ardışık artış ve indirim",
    level: "TYT · Temel Matematik",
    formula: {
      title: "Aynı yüzdeyle artış ve indirim başa döndürmez",
      expression: "Son fiyat = İlk × (1 + a/100) × (1 − a/100) = İlk × (1 − a²/10 000)",
      note: "Artış ilk fiyata, indirim artmış fiyata uygulanır; tabanlar farklıdır.",
    },
    trap: {
      title: "Başa dönme tuzağı",
      wrong: "%20 artıp %20 inen fiyat başlangıca döner.",
      right: "İndirim, artmış fiyatın %20'sidir: 1,2 × 0,8 = 0,96. Son fiyat ilk fiyatın %96'sıdır.",
      tell: "Artış ve indirim aynı yüzde olsa da uygulandıkları sayılar farklıdır.",
    },
    hook: {
      kind: "shortcut",
      title: "Aynı yüzde gider-gelir, hep eksi",
      body: "Aynı yüzdeyle art-in (ya da in-art) her zaman kayıptır: net değişim −(a²/100)%. %20 için %4, %10 için %1 kayıp.",
    },
    question: {
      prompt: "Bir ürünün fiyatı önce %20 artırılıp sonra %20 indiriliyor. Son fiyat, ilk fiyata göre nasıl değişmiştir?",
      options: ["%4 azalmıştır", "Değişmemiştir", "%4 artmıştır", "%2 azalmıştır", "%20 azalmıştır"],
      answer: "%4 azalmıştır",
      explanation: "İlk fiyat 100 olsun: %20 artışla 120; 120'nin %20'si 24, indirimle 96. 96, 100'den %4 azdır.",
      steps: ["100 → %20 artış → 120", "120'nin %20'si = 24 → 120 − 24 = 96", "96, 100'e göre %4 az"],
      twoOption: {
        pair: ["%4 azalmıştır", "Değişmemiştir"],
        hint: "İki yüzde aynı ama uygulandıkları sayılar farklı: artış ilk fiyata, indirim artmış fiyata. İkisinin tutarını ayrı ayrı hesapla.",
      },
    },
  },
  universite: {
    topic: "Merkezî eğilim ölçüleri · Aykırı değer",
    level: "Üniversite · İstatistik",
    formula: {
      title: "Ortalama toplar, medyan sıralar",
      expression: "Ortalama = Σx / n     Medyan = sıralı verinin ortadaki değeri",
      note: "Aykırı değer toplamı değiştirir; sıralamadaki orta değeri değiştirmez.",
    },
    trap: {
      title: "Ortalama her zaman temsil eder tuzağı",
      wrong: "Ortalama, veri setinin tipik değerini her zaman gösterir.",
      right: "Tek bir aykırı değer ortalamayı kendine çeker; çarpık dağılımda tipik değeri medyan gösterir.",
      tell: "Soruda uç bir değer varsa 'hangi ölçü etkilenmez' diye sorulur.",
    },
    hook: {
      kind: "analogy",
      title: "Sıraya bakan, miktara bakmayan",
      body: "Medyan sıraya bakar, büyüklüğe değil: en büyük değer 38 de olsa 380 de olsa ortadaki sayı yerinden kıpırdamaz. Ortalama her sayıyı toplar; uçtaki değerin peşinden gider.",
    },
    question: {
      prompt: "2, 3, 3, 4, 38 veri setinde 38 aykırı değerdir. Aşağıdaki ölçülerden hangisi bu değerden en az etkilenir?",
      options: ["Medyan", "Aritmetik ortalama", "Varyans", "Standart sapma", "Değişim aralığı"],
      answer: "Medyan",
      explanation: "Sıralı verinin ortası 3 (medyan). Ortalama (2 + 3 + 3 + 4 + 38) / 5 = 10; 38 onu yukarı çekti. Varyans, standart sapma ve değişim aralığı da 38'le büyür.",
      steps: ["Sıralı veri: 2, 3, 3, 4, 38 → orta değer 3", "Ortalama = 50 / 5 = 10", "38 yerine 380 yazılsa medyan yine 3, ortalama 78 olur"],
      twoOption: {
        pair: ["Medyan", "Aritmetik ortalama"],
        hint: "Biri her değeri toplayarak, öbürü yalnız sıraya bakarak bulunur. 38'i 380 yapsan hangisi değişir, hangisi değişmez?",
      },
    },
  },
  akademik: {
    topic: "İşçi problemleri · Birlikte çalışma",
    level: "KPSS · ALES · Matematik",
    formula: {
      title: "Günler değil, günlük iş payları toplanır",
      expression: "1/a + 1/b = 1/t   (a, b: tek başına süreler; t: birlikte süre)",
      note: "Birlikte süre, en hızlı olanın süresinden her zaman kısadır.",
    },
    trap: {
      title: "Günlerin ortalaması tuzağı",
      wrong: "6 günde ve 12 günde bitiren iki işçi birlikte (6 + 12) / 2 = 9 günde bitirir.",
      right: "Günlük paylar toplanır: 1/6 + 1/12 = 3/12 = 1/4. Birlikte 4 günde biter.",
      tell: "Birlikte çalışma süresi 6 günden uzun olamaz; 9 gün baştan elenir.",
    },
    hook: {
      kind: "shortcut",
      title: "Payları topla, günleri değil",
      body: "Her kişinin bir günde yaptığı payı yaz (1/a, 1/b), payları topla, sonucu ters çevir. Kontrol: cevap, en hızlı kişinin süresinden küçük olmalı.",
    },
    question: {
      prompt: "Bir işi A tek başına 6 günde, B tek başına 12 günde bitiriyor. İkisi birlikte aynı işi kaç günde bitirir?",
      options: ["3", "4", "6", "9", "18"],
      answer: "4",
      explanation: "A günde işin 1/6'sını, B 1/12'sini yapar. Birlikte 1/6 + 1/12 = 3/12 = 1/4; bir günde işin çeyreği biter, iş 4 gün sürer.",
      steps: ["A: 1/6, B: 1/12 (günlük pay)", "1/6 + 1/12 = 2/12 + 1/12 = 3/12 = 1/4", "Günde 1/4 iş → 4 günde biter"],
      twoOption: {
        pair: ["4", "9"],
        hint: "Birlikte çalışan iki kişi, tek başına en hızlı olandan daha mı uzun sürer, daha mı kısa? Bu tek soru iki şıktan birini eler.",
      },
    },
  },
};

/** Vitrindeki adımlar: ders önizlemesi → soru → kayıt köprüsü. */
export const SHOWCASE_COPY = {
  kicker: "Kayıt olmadan dene",
  title: "10 saniyede mantığı kap, sonra kendini dene",
  stepLesson: "📖 Canlı ders ve sınav tuzağı",
  stepQuestion: "🎯 Bu konunun sınav sorusu",
  tryButton: "🎯 Şimdi kendini dene: bu konunun sınav sorusunu çöz →",
  checkButton: "Kontrol et",
  bridgeTitle: "Bu yalnız 10 saniyelik bir önizlemeydi. Şimdi kendi sınavın için başlat!",
  bridgeBody: "Kendi notunu yüklersin ya da hazır müfredattan başlarsın; ilk konu ücretsiz, kart istemiyoruz.",
  bridgeSecondary: "Önce örnek bir dersi incele →",
  again: "Başka bir profil dene",
} as const;

export function bridgeCtaLabel(segment: AudienceSegment): string {
  return `🚀 Kendi notunu yükle ya da ${segment.campName} ücretsiz başlat →`;
}
