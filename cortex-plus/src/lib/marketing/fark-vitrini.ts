/**
 * Fark vitrini (20 Kasım 2026, Faz 7): ana sayfadaki "Aynı not, iki ayrı sonuç" bölümünün içinde, misafirin kayıt
 * olmadan dokunabildiği üç kart; /ornek sayfasının sonunda ikisi ("Kayıtlı Hesapta Açılan Süper Güçler").
 *
 * Kart başlıkları ve rozetler ürün sahibinin metni. Karşılaştırma cümleleri onun cümleleridir; yalnız tutulamayacak
 * kısmı yumuşatıldı:
 * - Radyo: kilit ekranında arka planda çalmak tarayıcıya bağlı. "Kilit ekranında bile" yerine "kilit ekranından ve
 *   kulaklıktan yönetilir" (MediaSession; ürünün podcast oynatıcısı da aynı denetimleri verir).
 * - Kırmızı kalem: bugün kâğıt fotoğrafı yazılı denemenin "Kâğıtta çöz" seçeneğinde okunuyor (Plus). "Deftere
 *   çözdüğün her soru" yazılmaz; yazılı deneme kâğıdı yazılır.
 * - Sınıfla paylaş: +50 kredi arkadaş 1. ünitenin konu testini bitirince yazılır, ayda en çok 5 arkadaş; koşul metinde.
 *
 * Bu dosya bağımlılıksız: istemci kartları (radyo, kırmızı kalem) içe aktarır, istemci paketine başka modül taşımaz.
 * Karşılaştırmanın iki etiketi ana sayfanın düello etiketleriyle aynı (`HOME_COPY.duel`; bekçi eşitliği tutar). Rakip
 * marka adı geçmez; karşı taraf her yerde "Genel yapay zekâ botları". Sayfada model, ses ya da ağ çağrısı yok: radyo
 * `public/ornek/` altındaki kayıtlı kesitleri çalar (`demoRadioPlaylist`), QR kodu cihazda/sunucuda çizilir.
 */

export type ShowcaseCompare = { cortex: string; others: string };

/** Ana sayfanın düello etiketleriyle aynı (bekçi: `fark-vitrini.test.tsx`). */
export const SHOWCASE_COMPARE_LABELS = {
  us: "Cortex Plus",
  them: "Genel yapay zekâ botları",
} as const;

/** "🎧 Başlık" → simge ve başlık. Simge süs: ekran okuyucu başlığı simgesiz okur. */
export function splitShowcaseTitle(title: string): { emoji: string; text: string } {
  const at = title.indexOf(" ");
  return at < 0 ? { emoji: "", text: title } : { emoji: title.slice(0, at), text: title.slice(at + 1) };
}

export const FARK_VITRINI = {
  /** Ana sayfadaki kart grubunun üst etiketi. */
  kicker: "Kayıt olmadan dene",
  /** /ornek sayfasının sonundaki şerit. */
  stripTitle: "Kayıtlı Hesapta Açılan Süper Güçler",
  stripLead: "Hazırlığının içinde açılan iki araç; burada örnek içerikle, kayıt olmadan ve kredi harcamadan dene.",
  plus: "Plus",
} as const;

export const RADIO_SHOWCASE = {
  id: "sinav-radyosu",
  title: "🎧 Otobüste / Yolda Kesintisiz Sınav Radyosu",
  /** Ekranda büyük harfle (CSS); ekran okuyucu düz okur. */
  badge: "0 kredi · kayıtlı podcast",
  play: "Örnek Radyo Akışını Dinle",
  pause: "Duraklat",
  next: "Sonraki ünite",
  nowPlaying: "Şimdi çalıyor",
  unitPrefix: "Ünite",
  queueLabel: "Radyo akışı",
  stationLine: "Sınav Radyosu",
  note: "Podcast üretimi Plus'ta; radyoda dinlemek kredi harcamaz.",
  failed: "Örnek kesit şu an çalınamadı. Bağlantını kontrol edip yeniden dene.",
  compare: {
    cortex:
      "Ürettiğin bütün ünite podcastlerini otobüste radyo gibi sırayla çalar; kilit ekranından ve kulaklıktan yönetilir (0 kredi).",
    others: "Ekrana düz yazı döker; kilit ekranında sıralı bir ders radyosu kuramaz.",
  } satisfies ShowcaseCompare,
} as const;

export const RED_PEN_SHOWCASE = {
  id: "kirmizi-kalem",
  title: "🖊️ Kırmızı Kalemli Hoca — Yazılı Kağıdını Fotoğrafla, Puan Kırılan Yeri Gör",
  paperLabel: "Örnek Çözüm Kağıdı",
  question: "Soru 2 · 20 puan — a) 3(x − 2) = 12 denklemini çözünüz (15 puan). b) Bulduğun x için √((2 − x)²) kaçtır? (5 puan)",
  /*
    Öğrencinin el yazısıyla çözümü, satır satır (Faz 8, 20 Kasım 2026, ürün sahibinin isteği): a şıkkı doğru (x = 6);
    b şıkkında ara basamakta işaret / mutlak değer hatası: √((2 − 6)²) = |2 − 6| = 4 olmalıydı, öğrenci 2 − 6 = −4
    yazdı. Bu hata b'nin sonucunu her zaman yanlış yapar, yani notlandırma o şıkkın puanını her zaman kırar (eski
    örnekteki "birim yazılmamış" doğru sonuçta her zaman puan kırmıyordu: kısa ama doğru çözüm tam puan alır).
  */
  lines: ["a) 3x − 6 = 12", "3x = 18 → x = 6", "b) √((2 − 6)²) = 2 − 6 = −4"],
  /** Doğru kurulan satırlar (0'dan sayılır) ve kazandırdıkları. */
  earned: { lines: [0, 1], badge: "+15 Puan · a) Denklem kurulumu ve çözüm tam" },
  /** Hocanın kırdığı satır. */
  lost: { line: 2, badge: "-5 Puan · Hoca Buradan Kırar: Ara basamakta işaret / mutlak değer hatası" },
  total: "Toplam 15 / 20 puan",
  views: { label: "Kâğıt görünümü", plain: "Öğrencinin kâğıdı", marked: "Kırmızı kalemle" },
  note: "Plus'ta, yazılı denemenin “Kâğıtta çöz” seçeneğiyle.",
  compare: {
    cortex:
      "Yazılı denemeyi kâğıda çözüp fotoğrafını çekersin; yalnız sonuca değil, hocanın puan kıracağı ara basamağa da bakar ve orayı kırmızı kalemle işaretler.",
    others: "Yalnız sonuca bakar; ara basamakta kaybedilen puanı yakalayamaz.",
  } satisfies ShowcaseCompare,
} as const;

/** Örnek davet adresi: gerçek bir davet değil, kartta "Örnek" diye yazılı. */
export const SHARE_SAMPLE_URL = "https://cortexplus.app/davet/ORNEK";

export const CLASS_SHARE_SHOWCASE = {
  id: "sinif-klonlama",
  title: "📲 Sınıfla Paylaş (+50 Kredi) & QR Kodlu Sınav Sabahı Kağıdı",
  bonus: "+50 Bonus Kredi",
  sheetTopic: "Köklü Sayılar",
  /** Mini kâğıdın satırları: etiket ürünün kâğıt etiketlerinden (`CRAM_KIND_LABEL`). */
  sheetLines: [
    { kind: "formula", text: "√(x²) = |x|" },
    { kind: "teacher", text: "x < 0 ise √(x²) = −x" },
    { kind: "warn", text: "√a · √b = √(ab) yalnız a, b ≥ 0 iken" },
  ],
  qrTitle: "Örnek davet QR kodu: cortexplus.app/davet/ORNEK",
  /** QR'ın altında iki satır: örnek olduğu ve adresi (adres yalnız eğik çizgilerden bölünür). */
  qrCaption: { label: "Örnek QR", url: "cortexplus.app/davet/ORNEK" },
  stepsSummary: "Paylaşınca ne olur?",
  steps: [
    "Hazırladığın yolu WhatsApp sınıf grubuna atarsın.",
    "Arkadaşın 1. üniteyi ücretsiz klonlar; aynı konu sırasıyla kendi hesabında açılır, senin sonuçların paylaşılmaz.",
    "Arkadaşın 1. ünitenin konu testini bitirince sen +50 kredi kazanırsın (ayda en çok 5 arkadaş).",
  ],
  note: "Sınav sabahı kâğıdı Plus'ta; paylaşım bağlantısı her hesapta.",
  compare: {
    cortex:
      "Tek dokunuşla hazırladığın yolu WhatsApp sınıf grubuna at; arkadaşın 1. üniteyi ücretsiz klonlasın, konu testini bitirince sen +50 kredi kazan.",
    others: "Kişiye özel sohbette hapis kalır, sınıfla klonlanamaz.",
  } satisfies ShowcaseCompare,
} as const;

/** Bekçi testlerinin taradığı bütün vitrin metni. */
export function allShowcaseCopy(): string {
  return [
    ...Object.values(SHOWCASE_COMPARE_LABELS),
    ...Object.values(FARK_VITRINI),
    RADIO_SHOWCASE.title,
    RADIO_SHOWCASE.badge,
    RADIO_SHOWCASE.play,
    RADIO_SHOWCASE.pause,
    RADIO_SHOWCASE.next,
    RADIO_SHOWCASE.nowPlaying,
    RADIO_SHOWCASE.queueLabel,
    RADIO_SHOWCASE.stationLine,
    RADIO_SHOWCASE.note,
    RADIO_SHOWCASE.failed,
    ...Object.values(RADIO_SHOWCASE.compare),
    RED_PEN_SHOWCASE.title,
    RED_PEN_SHOWCASE.paperLabel,
    RED_PEN_SHOWCASE.question,
    ...RED_PEN_SHOWCASE.lines,
    RED_PEN_SHOWCASE.earned.badge,
    RED_PEN_SHOWCASE.lost.badge,
    RED_PEN_SHOWCASE.total,
    ...Object.values(RED_PEN_SHOWCASE.views),
    RED_PEN_SHOWCASE.note,
    ...Object.values(RED_PEN_SHOWCASE.compare),
    CLASS_SHARE_SHOWCASE.title,
    CLASS_SHARE_SHOWCASE.bonus,
    CLASS_SHARE_SHOWCASE.sheetTopic,
    ...CLASS_SHARE_SHOWCASE.sheetLines.map((line) => line.text),
    CLASS_SHARE_SHOWCASE.qrTitle,
    ...Object.values(CLASS_SHARE_SHOWCASE.qrCaption),
    CLASS_SHARE_SHOWCASE.stepsSummary,
    ...CLASS_SHARE_SHOWCASE.steps,
    CLASS_SHARE_SHOWCASE.note,
    ...Object.values(CLASS_SHARE_SHOWCASE.compare),
  ].join("\n");
}
