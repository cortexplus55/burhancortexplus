import { FREE_LIMITS, FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { FREE_PAGE_TOTAL, PLUS_ONLY_FEATURES } from "@/lib/billing/free-tier-copy";
import { PARENT_LINK_TTL_HOURS } from "@/lib/payments/parent-link-ttl";
import { PARENT_WHATSAPP_BUTTON } from "@/lib/payments/parent-whatsapp-copy";

/**
 * Ana sayfanın bütün cümleleri (19 Ekim 2026, ürün sahibi: "misafire sistemimizde olmayan bir şey
 * gösteriyor muyuz, yalan vaat var mı?"). Tek kural: burada yazan her şey bugün üründe çalışıyor.
 * Eski sayfa saatli günlük plan, "net" analizi, Plus'ta "gelişmiş model" ve "öncelikli destek"
 * vaat ediyordu; hiçbiri yoktu. Bekçi: `tests/unit/marketing-claims.test.ts` yasak cümleleri tarar.
 *
 * Rakip adı geçmez: karşılaştırmalı reklam ancak doğrulanabilir ve kötülemeyen biçimde serbest;
 * kendi ölçtüğümüz sayıyı söylemek yeterli ve güvenli.
 *
 * 11 Kasım 2026: ana sayfa üç bölüme inince kanıt şeridi, dört adım, özellik ızgarası, ders sahnesi ve eski güven
 * kartlarının verisi (PROOF, STEPS, FEATURES, LESSON_SCENE, TRUST) silindi; hiçbir ekranda gösterilmiyordu.
 *
 * Aynı gece, kokpit: kahramandaki durağan sahne ve film şeridi de kalktı (HERO_SCENE, REEL_FRAMES). Sahnenin
 * anlattığı yolu tur zaten oynatıyor; şeridin saydığı etkinlikleri kokpit canlı gösteriyor. Aynı özellik sayfada üç
 * kez anlatılmaz.
 */

export const HERO = {
  /** Başlığın iki parçası: ikincisi ışıklı yazılır. Alt cümle seçili sekmeden gelir (`landing-showcase.ts`). */
  titleLead: "Notunu yükle,",
  titleAccent: "sınava hazır bir yol çıksın.",
} as const;

/** Bölüm başlıkları: her bölümde tek başlık, en çok tek cümle. */
export const HOME_COPY = {
  duel: {
    title: "Aynı not, iki ayrı sonuç",
    lead: "Genel bir yapay zekâ botuna da sorabilirsin. Fark, sınav haftasında ortaya çıkar.",
    us: "Cortex Plus",
    them: "Genel yapay zekâ botları",
    /** Faz 9 (20 Kasım 2026): akordeonun altındaki tek bağlantı (tam tablo Özellikler sayfasında). */
    more: "Tüm özellikleri karşılaştır",
  },
  plans: {
    title: "Ücretsiz başla, sınav döneminde büyüt",
    freeBadge: "İlk ders süresiz açık",
    freeLede: "İlk dersin süre sınırı olmadan ücretsiz.",
    weekLede: "Sınava bir hafta mı kaldı? Tek ödeme, abonelik açılmaz.",
  },
} as const;

/**
 * Kahramanın altındaki TEK satır (Faz 9, 20 Kasım 2026; önce üç hap, kabul edilen türler satırı ve iki bağlantı alt alta
 * duruyordu). İki gerçek bugün doğru: kayıt kart istemez, ilk dersin temel adımları süre sınırı olmadan açık. Notu
 * olmayan öğrencinin yolu (hazır müfredat) ve örnek ders aynı satırda bağlantı. Kabul edilen türler artık birinci
 * adımın bırakma alanında yazılı (`JOURNEY_FILE.dropLine`).
 */
export const HERO_FOOT = {
  facts: ["Kart istemiyoruz", "İlk dersin süresiz ücretsiz"],
  noNotes: { lead: "Notun yoksa", label: "hazır müfredattan başla", href: "/mufredat" },
  sample: { label: "Örnek dersi incele", href: "/ornek" },
} as const;

/**
 * Ücretsiz ile Plus'ın tek ekranda karşılaştırması (11 Kasım 2026). Sayılar sabitlerden; Plus sütununda yalnız
 * ücretsizde kapalı olanlar yazılır (`PLUS_ONLY_ACTIONS` ve sınav sabahı kâğıdı).
 */
export const FREE_PLAN_POINTS = [
  "Konu anlatımı, akıllı kartlar, doğru/yanlış ve konu testi",
  `AI öğretmene günde ${FREE_LIMITS.chat} mesaj, ayda ${FREE_LIMITS.photo} fotoğraftan çözüm`,
  `Bir sınav hazırlığı, toplam ${FREE_PAGE_TOTAL} sayfa belge`,
] as const;

export const PLUS_PLAN_POINTS = [
  "Podcast ve 1 dakikalık çizimli video",
  "Sözlü deneme, yazılı deneme ve ikiz sınav",
  "Sınav sabahı kâğıdı",
  "Belgenin tamamı, birden çok hazırlık, daha hızlı yazım",
] as const;

/** Sınav Haftası kartı: haftalık Plus. Plus'taki her şey yedi gün açık; ödeme tek seferlik, yenileme yok. */
export const WEEK_PLAN_POINTS = [
  "Plus'taki her şey 7 gün açık",
  "Tek ödeme; kendiliğinden yenilenmez",
  "Sınav sabahı kâğıdı ve ikiz sınav dahil",
] as const;

/**
 * Plan kartlarının altındaki tek güven satırı (Faz 9, 20 Kasım 2026; eski üç paragraflık liste kalktı). Üçü de bugün
 * doğru: ders ve test notundaki sayfalardan yazılır (kaynak sayı önceliği), `AUTO_RENEW_SUPPORTED = false`, ödeme PayTR
 * iFrame'iyle alınır (kart bilgisi bize gelmez). Simgeler `landing-page.tsx`te, sırayla.
 */
export const TRUST_LINE = ["Notuna sadık", "Otomatik yenileme yok", "PayTR ile güvenli ödeme"] as const;

export type FaqItem = { q: string; a: string; link?: { label: string; href: string } };

/** Yenileme sorusu: ana sayfanın ve fiyat sayfasının sık sorulanlarında aynı metin (27 Kasım 2026, GEO). */
export const RENEWAL_FAQ: FaqItem = {
  q: "Abonelik kendiliğinden yenilenir mi?",
  a: "Hayır, otomatik yenileme yok. Dönemin bitmesine 3 gün kala hatırlatırız; yenilemezsen hesabın ücretsize döner, çalışmaların yerinde kalır.",
};

/** "podcast, video, sözlü, yazılı deneme ve sınav sabahı kâğıdı": Plus'a özel işler, tek kaynaktan, küçük harfle. */
const PLUS_ONLY_LIST = (() => {
  const names = PLUS_ONLY_FEATURES.map((name) => name.toLocaleLowerCase("tr"));
  return `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]}`;
})();

const lowerFirst = (text: string) => `${text.charAt(0).toLocaleLowerCase("tr")}${text.slice(1)}`;

/**
 * Ana sayfanın sık sorulanları (Faz 9, 20 Kasım 2026, ürün sahibi: "beş soru, kısa ve samimi; gerisi Yardım Merkezi'nde").
 * Aynı dizi sayfada çizilir ve FAQPage yapılandırılmış verisine gider (`src/app/page.tsx`). Sayılar sabitlerden:
 * ücretsiz hak (`FREE_TIER_SENTENCE`, `FREE_PAGE_TOTAL`), Plus'a özel işler (`PLUS_ONLY_FEATURES`), veli linkinin süresi
 * (`PARENT_LINK_TTL_HOURS`), düğmenin adı (`PARENT_WHATSAPP_BUTTON`). Otomatik yenileme yok (`AUTO_RENEW_SUPPORTED`);
 * bitişten 3 gün önce hatırlatma bildirimi gider.
 */
export const FAQ: FaqItem[] = [
  {
    q: "Cortex Plus tam olarak ne yapıyor?",
    a: "Ders notunu ya da kitabını yüklüyorsun; içinden konular çıkarılır ve sınav tarihine göre bir çalışma yolu kurulur. Her konunun dersi, kartları, doğru/yanlışı ve konu testi senin notundan hazırlanır; Plus'ta podcast, çizimli video, sözlü ve yazılı deneme de açılır.",
  },
  {
    q: "Ücretsiz neler yapabilirim?",
    a: `Kart istemiyoruz. Ücretsiz hesapta ${lowerFirst(FREE_TIER_SENTENCE)} var. Bir sınav hazırlığı kurup toplam ${FREE_PAGE_TOTAL} sayfa belge işletebilirsin. Sonraki konular Plus'ta açılır; ${PLUS_ONLY_LIST} Plus'a özeldir.`,
  },
  {
    q: "Ders notum yoksa kullanabilir miyim?",
    a: "Evet. Hazır müfredattan başlayabilirsin: MEB kazanımlarına ve ÖSYM kılavuzlarına dayalı, doğrulanmış konu anlatımları ve sorular hazır. İstersen kurulumda sınavını ve konularını yazarak da yolunu kurabilirsin.",
    link: { label: "Hazır müfredata göz at", href: "/mufredat" },
  },
  {
    q: "Kartım yok, velim nasıl ödeyebilir?",
    a: `Paket kartındaki “${PARENT_WHATSAPP_BUTTON.replace(/^\S+\s/, "")}” düğmesiyle planını veline gönder. Velin hesap açmadan ve şifre girmeden linki açıp PayTR ile öder; link ${PARENT_LINK_TTL_HOURS} saat geçerli ve paket senin hesabına tanımlanır.`,
  },
  RENEWAL_FAQ,
];

/** Sık sorulanların altındaki tek bağlantı: bütün sorular Yardım sayfasında. */
export const FAQ_MORE = { label: "Tüm sorular için Yardım Merkezi", href: "/yardim" } as const;
