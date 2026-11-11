import { FREE_LIMITS, FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { allowanceWorkLine } from "@/lib/billing/tier-presentation";
import { PLAN_ALLOWANCES } from "@/lib/credits/price-table";

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
 */

export const HERO = {
  /** Başlığın iki parçası: ikincisi ışıklı yazılır. Alt cümle seçili sekmeden gelir (`landing-showcase.ts`). */
  titleLead: "Notunu yükle,",
  titleAccent: "sınava hazır bir yol çıksın.",
  secondary: { label: "Önce örnek bir dersi incele →", href: "/ornek" },
} as const;

/**
 * Kahramanın altındaki üç gerçek (11 Kasım 2026, "kısa ve net"). Üçü de bugün doğru: kayıt kart istemez, ilk dersin
 * temel adımları süre sınırı olmadan açık, abonelik kendiliğinden yenilenmez (`AUTO_RENEW_SUPPORTED = false`).
 */
export const HERO_FACTS = ["Kart istemiyoruz", "İlk dersin süresiz ücretsiz", "Otomatik yenileme yok"] as const;

/**
 * Ücretsiz ile Plus'ın tek ekranda karşılaştırması (11 Kasım 2026). Sayılar sabitlerden; Plus sütununda yalnız
 * ücretsizde kapalı olanlar yazılır (`PLUS_ONLY_ACTIONS` ve sınav sabahı kâğıdı).
 */
export const FREE_PLAN_POINTS = [
  "Konu anlatımı, akıllı kartlar, doğru/yanlış ve konu testi",
  `AI öğretmene günde ${FREE_LIMITS.chat} mesaj, günde ${FREE_LIMITS.photo} fotoğraftan çözüm`,
  `Bir sınav hazırlığı, toplam ${FREE_PAGE_TOTAL} sayfa belge`,
] as const;

export const PLUS_PLAN_POINTS = [
  "Podcast ve 1 dakikalık çizimli video",
  "Sözlü deneme, yazılı deneme ve ikiz sınav",
  "Sınav sabahı kâğıdı",
  "Belgenin tamamı, sınırsız hazırlık, daha hızlı yazım",
] as const;

/** Karşılaştırmanın altındaki üç güven cümlesi; üçü de bugün doğru. */
export const TRUST_FACTS = [
  { title: "Notuna sadık", body: "Ders ve test notundaki sayfalardan yazılır; notunda olmayan sayı uydurulmaz." },
  { title: "Otomatik yenileme yok", body: "Dönem bitmeden hatırlatırız; yenilemezsen ücretsize dönersin." },
  { title: "Kart bilgisi bize gelmez", body: "Ödeme PayTR ile alınır; velinin kartıyla da ödenir." },
] as const;

/** Kabul edilen kaynaklar ve notu olmayan öğrencinin yolu: en sık itirazın ("notum yok") tek satırlık cevabı. */
export const HERO_INPUTS = {
  accepts: "PDF, slayt, Word, fotoğraf, yapıştırılan metin ya da bağlantı.",
  noNotes: { label: "Notun yok mu? Hazır müfredattan başla", href: "/mufredat" },
} as const;

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Cortex Plus tam olarak ne yapıyor?",
    a: "Ders notunu yüklüyorsun; içinden çalışılacak konular çıkarılıyor ve her konu için ders, podcast, test, kartlar ve sözlü pratik hazırlanıyor. Hepsi senin notuna dayanır; genel bir ders anlatımı değil.",
  },
  {
    q: "Ücretsiz neler yapabilirim?",
    // 11 Kasım 2026 (ürün sahibinin kararı): ilk dersin döngüsü süreye ve haftalık hakka takılmaz; Plus'a özel olanlar
    // adıyla (bekçi test listeyi `PLUS_ONLY_FEATURES` ile karşılaştırır).
    a: `Kart istemiyoruz. Ücretsiz hesapta ${FREE_TIER_SENTENCE.charAt(0).toLocaleLowerCase("tr")}${FREE_TIER_SENTENCE.slice(1)} var. Bir sınav hazırlığı kurabilir, toplam ${FREE_PAGE_TOTAL} sayfa belge işletebilirsin; ilk dersten sonraki konular Plus'ta açılır. Podcast, video, sözlü, yazılı deneme ve sınav sabahı kâğıdı Plus'a özeldir; sesli dinleme de Plus'ta.`,
  },
  {
    q: "Plus'ta ne değişiyor?",
    a: `${allowanceWorkLine(PLAN_ALLOWANCES.plusMonthly)}; bütün konular, podcast, video ders, sözlü ve yazılı deneme, sınav sabahı kâğıdı; belgenin tamamı, sınırsız hazırlık ve hazır içerik yokken daha hızlı yazım. Yapay zekâ modeli aynı; fark neyin açık olduğunda, ne kadar ve ne kadar hızlı çalışabildiğinde.`,
  },
  {
    q: "Notumda olmayan bir şeyi sorarsam?",
    a: "Varsayılan modda cevap önce notundan gelir; notunda yoksa \"Genel bilgiden:\" diye ayrı yazılır. \"Yalnızca belgem\" modunu seçersen notunun dışına hiç çıkmaz.",
  },
  {
    q: "Ders notum yok, yine de kullanabilir miyim?",
    a: "Evet. Kurulumda \"Belgem yok\" de, sınavını ve konularını anlat; aynı yol konudan kurulur ve içeriğin belgenden gelmediği ekranda yazar.",
  },
  {
    q: "İçerik yanlış olursa ne oluyor?",
    a: "Her ders kavram kavram, her test soru soru ikinci bir yapay zekâ tarafından notuna karşı denetleniyor. Düzelmeyen kısım sana gösterilmiyor. Yine de hata görürsen ekrandaki \"Eğitmene yaz\" ya da Destek ile bize ilet; 24 saat içinde dönüyoruz.",
  },
  {
    q: "Kartım yok, nasıl ödeme yaparım?",
    a: "Ödeme PayTR ile banka kartı ya da kredi kartıyla alınır; velinin kartıyla da ödeyebilirsin, hesap senin kalır. Kart bilgisi bize gelmez.",
  },
  {
    q: "Abonelik kendiliğinden yenilenir mi?",
    a: "Hayır. Dönem bitmeden hatırlatırız; yenilemezsen hesabın ücretsize döner, çalışmaların yerinde kalır.",
  },
  {
    q: "Telefondan çalışır mı?",
    a: "Evet, tarayıcıdan. İndirmen gereken bir uygulama yok; ders, podcast ve testler telefonda da çalışıyor.",
  },
];
