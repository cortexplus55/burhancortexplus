import { FREE_LIMITS, FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { allowanceWorkLine } from "@/lib/billing/tier-presentation";
import { PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import type { Icon3DName } from "@/components/ui/icon-3d";

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
  secondary: { label: "Önce örnek bir dersi incele", href: "/ornek" },
} as const;

/**
 * Kahramandaki sahne (11 Kasım 2026, ikinci tur): bir ders notu, logonun şeridiyle çalışma yoluna dönüşür. Duraklar
 * ücretsiz hesapta süre sınırı olmadan açık olan ilk dersin adımlarıdır (`FIRST_LESSON_STEPS` ile aynı sıra); not,
 * turda oynanan örnekle aynı konu. Görsel süs değil: ürünün yaptığı işin resmi. Ekran okuyucu tek cümle duyar.
 */
export const HERO_SCENE = {
  label:
    "Bir ders notu çalışma yoluna dönüşüyor: konu anlatımı, kartlar, doğru/yanlış ve konu testi; yolun sonunda sınava hazırsın.",
  note: {
    title: "Köklü Sayılar",
    lines: ["³√(−8) = −2", "√(a²) = |a|", "√((−5)²) = 5"],
    /** İkinci satır fosforla işaretli; kenar notu öğrencinin kendi el yazısı. */
    marked: 1,
    margin: "← tuzak!",
  },
  stops: [
    { icon: "ders", label: "Konu anlatımı" },
    { icon: "kartlar", label: "Kartlar" },
    { icon: "dogru-yanlis", label: "Doğru / Yanlış" },
    { icon: "konu-testi", label: "Konu testi" },
  ] satisfies { icon: Icon3DName; label: string }[],
  goal: "Sınava hazır",
} as const;

/** Bölüm başlıkları: her bölümde tek başlık, en çok tek cümle. */
export const HOME_COPY = {
  proof: { title: "Ölçtük" },
  duel: {
    title: "Aynı not, iki ayrı sonuç",
    lead: "Genel bir yapay zekâ botuna da sorabilirsin. Fark, sınav haftasında ortaya çıkar.",
    us: "Cortex Plus",
    them: "Genel yapay zekâ botları",
  },
  reel: {
    title: "Bir nottan çıkan her şey",
    lead: "Hepsi aynı nottan yazılır. Etiketsizler ücretsiz hesapta da açık.",
    prev: "Önceki kareler",
    next: "Sonraki kareler",
  },
} as const;

export type ReelFrame = { id: string; icon: Icon3DName; title: string; body: string; plusOnly?: boolean };

/**
 * Film şeridi: hazırlık yolundaki ve Çalışma Stüdyosu'ndaki gerçek etkinlikler. `plusOnly` olanlar ücretsiz hesapta
 * hiç açılmaz (`PLUS_ONLY_ACTIONS` ve sınav sabahı kâğıdı); bekçi test listeyi kapılarla karşılaştırır.
 */
export const REEL_FRAMES: ReelFrame[] = [
  { id: "ders", icon: "ders", title: "Konu anlatımı", body: "Kısa ekranlar, önce dene soruları, formül kartları. Yanlış cevapta doğrusu hemen." },
  { id: "kartlar", icon: "kartlar", title: "Akıllı kartlar", body: "Zorlandığın kart önce gelir; aralıklı tekrarla unutmazsın." },
  { id: "dogru-yanlis", icon: "dogru-yanlis", title: "Doğru / Yanlış", body: "Hızlı kontrol; yanlış cümlenin doğrusu yanında." },
  { id: "konu-testi", icon: "konu-testi", title: "Konu testi", body: "Her şıkkın neden doğru ya da yanlış olduğu ayrı ayrı açıklanır." },
  { id: "ogretmen", icon: "ogretmen", title: "AI öğretmen", body: "Takıldığın yeri sor; cevap kendi notuna dayanır." },
  { id: "soru-coz", icon: "denklem", title: "Fotoğraftan soru çözümü", body: "Sorunun fotoğrafını çek ya da yaz; adım adım çözüm gelir." },
  { id: "duello", icon: "yildiz", title: "Düello ve yıldızlar", body: "Arkadaşına ya da bota meydan oku, seriyi koru." },
  { id: "podcast", icon: "podcast", title: "Podcast", body: "Ada ve Kerem konuyu konuşarak anlatır. Yolda, serviste dinle.", plusOnly: true },
  { id: "video", icon: "video", title: "Çizimli video", body: "Bir dakikada, çizim ve formülle anlatım.", plusOnly: true },
  { id: "sozlu", icon: "sozlu", title: "Sözlü deneme", body: "Sesli ya da yazılı cevapla; eksik bıraktığın yeri öğretmen bir kez sorar, sonunda not verir.", plusOnly: true },
  { id: "yazili", icon: "yazili", title: "Yazılı deneme ve İkiz Sınav", body: "Çoktan seçmeli ve açık uçlu; çıkmış sorularını yüklersen onların tarzında.", plusOnly: true },
  { id: "sinav-sabahi", icon: "tekrar", title: "Sınav sabahı kâğıdı", body: "Formüller, tuzaklar ve en çok yanıldığın noktalar tek sayfada.", plusOnly: true },
];

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
