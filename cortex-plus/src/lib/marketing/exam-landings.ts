import type { Icon3DName } from "@/components/ui/icon-3d";
import { FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { FREE_DOCUMENT_SENTENCE, PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";
import { DEFAULT_RANGE_SPAN } from "@/lib/documents/page-coverage";
import { REVIEW_LADDER_DAYS } from "@/lib/learning/review-items";
import type { FaqItem } from "@/lib/marketing/landing-content";
import { QUIET_END_HOUR, QUIET_START_HOUR, STUDY_SLOTS } from "@/lib/notifications/schedule";
import { PARENT_LINK_TTL_HOURS } from "@/lib/payments/parent-link-ttl";
import { PARENT_WHATSAPP_BUTTON } from "@/lib/payments/parent-whatsapp-copy";
import { REFUSAL_MESSAGE } from "@/lib/tutor/realtime/config";
import { EXAM_LANDING_LINKS, type ExamLandingId } from "@/lib/marketing/exam-landing-links";

/*
  Sınav açılış sayfaları (27 Kasım 2026, SEO ve GEO; ürün sahibinin isteği): `/yks-hazirlik`, `/lgs-hazirlik`,
  `/kpss-hazirlik`, `/tus-hazirlik`. Yüksek niyetli sınav aramaları ("YKS hazırlık", "LGS hazırlık" …) için herkese açık,
  tamamı sunucuda çizilen dört sayfa. Metinler burada, tek yerde; sayfa (`ExamLandingPage`), site haritası, `/llms.txt`,
  altbilgi ve `/sinav-hazirligi` bağlantıları aynı listeyi okur.

  Kurallar (bekçi `sinav-acilis-sayfalari.test.tsx`):
  - Tanım iki cümle ve sayfanın ilk 100 kelimesinin içinde; tek başına alıntılandığında "Cortex Plus bu sınav için ne
    yapar?" sorusunu cevaplar.
  - Her sayfada o sınava özel dört "cevap önce" sık sorulan; ilk cümle doğrudan cevap, en çok üç cümle. Aynı metin
    sayfanın FAQPage yapılandırılmış verisine gider.
  - Misafire gösterilen her söz bugün çalışır. Sayılar ve erişim kuralları koddan: canlı sesli öğretmenin erişimi
    (`REFUSAL_MESSAGE.plus_required`, `resolveRealtimeAccess` ile aynı kural), ücretsiz hak (`FREE_TIER_SENTENCE`),
    Plus'a özel işler (`PLUS_ONLY_SENTENCE`), veli bağlantısının süresi (`PARENT_LINK_TTL_HOURS`), gece sessiz saati
    (`QUIET_START_HOUR`–`QUIET_END_HOUR`), hatırlatma saatleri (`STUDY_SLOTS`), tekrar günleri (`REVIEW_LADDER_DAYS`) ve
    sayfa aralığı penceresinin eşiği (`DEFAULT_RANGE_SPAN`). Fiyat sayfada `plans` tablosundan okunur, burada yazılmaz.
  - Sahte istatistik, öğrenci yorumu, rakip adı ve "%100" yok. Konu ağaçları (KPSS, TUS, DUS, ALES) resmî ÖSYM listesi
    değildir ve bu söylenir; LGS ve YKS listeleri MEB kazanımlarındandır.
*/

export type { ExamLandingId };

export type ExamLandingFeature = {
  icon: Icon3DName;
  title: string;
  body: string;
  /** Ücretsiz hesapta açık olmayan işin rozeti ("Plus" ya da kısa açıklama). */
  chip?: string;
};

export type ExamLanding = {
  id: ExamLandingId;
  path: `/${string}-hazirlik`;
  /** Altbilgi, `/sinav-hazirligi` bağlantısı ve gezinme yolundaki ad. */
  navLabel: string;
  /** `<title>` (sona " | Cortex Plus" eklenir). */
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  /** İki cümlelik, alıntılanabilir tanım (sayfanın ilk paragrafı). */
  definition: readonly [string, string];
  /** Kaydın ön seçimi (`signup-preset.ts`). */
  signupHref: `/kayit?hedef=${string}`;
  featuresTitle: string;
  features: readonly ExamLandingFeature[];
  /** Notu olmayan öğrencinin başlayacağı resmî müfredat ya da konu ağacı programları (kayıt defteri kimlikleri). */
  programsTitle: string;
  programsLead: string;
  programIds: readonly string[];
  faq: readonly FaqItem[];
  /** `/llms.txt` sayfa notu. */
  llmsNote: string;
};

const lowerFirst = (text: string) => `${text.charAt(0).toLocaleLowerCase("tr")}${text.slice(1)}`;

function listWith(items: readonly string[], conjunction: "ve" | "ya da"): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** "Canlı sesli öğretmen Sınav Haftası, Plus ve Sigma'da açık." — sesli ders ucunun ret metniyle aynı. */
export const LIVE_VOICE_ACCESS = REFUSAL_MESSAGE.plus_required;
/** "1, 3, 7 ve 14". */
const REVIEW_DAYS = listWith(REVIEW_LADDER_DAYS.map(String), "ve");
/** "22:00–08:00". */
const QUIET_RANGE = `${clock(QUIET_START_HOUR)}–${clock(QUIET_END_HOUR)}`;
/** "18:30, 19:00, 20:00 ya da 21:00". */
const STUDY_TIMES = listWith(
  STUDY_SLOTS.map((slot) => slot.label),
  "ya da",
);
/** Düğmenin adı, baştaki simge olmadan ("Velime WhatsApp'tan Ödeme Linki Gönder"). */
const PARENT_BUTTON_NAME = PARENT_WHATSAPP_BUTTON.replace(/^\S+\s/, "");
const RANGE_PAGES = DEFAULT_RANGE_SPAN;

/** Ücretsiz ve Plus ayrımı; dört sayfada aynı cümleler. */
const FREE_AND_PLUS_ANSWER = `Ücretsiz hesapta kart istenmez: ${lowerFirst(FREE_TIER_SENTENCE)} açık. ${LIVE_VOICE_ACCESS} ${PLUS_ONLY_SENTENCE}`;

const LIVE_VOICE_FEATURE: ExamLandingFeature = {
  icon: "ogretmen",
  title: "Canlı sesli öğretmen",
  body: `Takıldığın yerde “Konuş”a basarsın: öğretmen seni dinler, sesli cevap verir, gerektiğinde formülü tahtaya yazar ve konuşma sohbetine kaydedilir. ${LIVE_VOICE_ACCESS}`,
  chip: "Plus",
};

const YKS: ExamLanding = {
  id: "yks",
  path: "/yks-hazirlik",
  navLabel: "YKS hazırlık",
  metaTitle: "YKS hazırlık: TYT ve AYT notundan çalışma yolu",
  metaDescription:
    "TYT ve AYT notunu yükle; sınav tarihine göre gün gün çalışma yolu, 5 şıklı konu testi, yanlışın ikizi soru ve canlı sesli öğretmenle YKS'ye hazırlan.",
  eyebrow: "YKS · TYT ve AYT",
  h1: "YKS'ye kendi notundan hazırlan",
  definition: [
    "Cortex Plus, YKS'ye hazırlanan öğrencinin TYT ve AYT notundan (PDF, slayt, Word ya da defter fotoğrafı) konu anlatımı, 5 şıklı konu testi ve sınav tarihine göre gün gün bir çalışma yolu hazırlayan yapay zekâ öğretmenidir.",
    "Notu olmayan öğrenci MEB'in YKS'ye esas kazanımlarından başlar; testte yanlış yaptığı sorunun ikiziyle aynı kavramı hemen yeniden dener.",
  ],
  signupHref: "/kayit?hedef=yks-lgs",
  featuresTitle: "TYT ve AYT için neler var",
  features: [
    {
      icon: "ders",
      title: "Notundan çalışma yolu",
      body: `PDF, slayt, Word ya da defter fotoğrafını yüklersin; konular çıkarılır ve sınav tarihine göre ders, konu testi ve kartlarla gün gün sıralanır. Birden çok fotoğraf tek belgede birleşir, ${RANGE_PAGES} sayfayı aşan PDF'te işlenecek sayfaları sen seçersin.`,
    },
    LIVE_VOICE_FEATURE,
    {
      icon: "konu-testi",
      title: "Yanlışın ikizi",
      body: `Konu testinde yanlış yaptığın sorunun altından ikiz soruyu açarsın: aynı kavram, sayıları ya da öncülleri değişmiş tek soru. Yanlışın ayrıca ${REVIEW_DAYS} gün sonra yeniden sorulur.`,
    },
    {
      icon: "video",
      title: "1 dakikalık çizimli özet",
      body: "Konunun özeti dikey, bir dakikalık çizimli videoda anlatılır; formül ve şema tahtaya çizilerek gelir.",
      chip: "Plus",
    },
    {
      icon: "tekrar",
      title: "Sınav sabahı kâğıdı",
      body: "Sınavdan önceki sabah için tek kâğıt: formül özeti, notunun özel kuralları, sınav tuzakları ve en çok yanıldığın noktalar. Yazdırırsın ya da PDF olarak kaydedersin.",
      chip: "Plus",
    },
  ],
  programsTitle: "Notun yoksa: YKS kazanımları",
  programsLead: "Her ders MEB'in YKS'ye esas kazanımlarından çıkarıldı; ünite ve kazanım sayfaları herkese açık.",
  programIds: [
    "yks-2026-matematik",
    "yks-2026-fizik",
    "yks-2026-kimya",
    "yks-2026-biyoloji",
    "yks-2026-tde",
    "yks-2026-tarih",
    "yks-2026-cografya",
  ],
  faq: [
    {
      q: "Cortex Plus YKS hazırlığında ne yapar?",
      a: "TYT ve AYT notundan konu anlatımı, 5 şıklı konu testi, kartlar ve sınav tarihine göre gün gün bir çalışma yolu hazırlar. Her konu ders, konu testi ve kartlarla ilerler; testte zorlandığın konuya odaklı pratik eklenir. Notun yoksa MEB'in YKS kazanımlarından hazır müfredatla başlarsın.",
      link: { label: "YKS kazanımlarına göz at", href: "/mufredat/yks-2026-matematik" },
    },
    {
      q: "Defter fotoğrafı ya da uzun bir PDF yükleyebilir miyim?",
      a: `Evet; PDF, slayt, Word ve defter fotoğrafı yüklenir, birden çok fotoğraf tek belgede birleşir. ${RANGE_PAGES} sayfayı aşan PDF'te hangi sayfaların işleneceğini sen seçersin.`,
    },
    {
      q: "Yanlış yaptığım soruları nasıl telafi ederim?",
      a: `Konu testinde yanlış yaptığın sorunun altından ikiz soruyu açarsın: aynı kavram, sayıları ya da öncülleri değişmiş tek soru. Yanlışların ${REVIEW_DAYS} gün sonra yeniden sorulur ve yanlışlar defterinde birikir. Plus'taki sınav sabahı kâğıdı en çok yanıldığın noktaları tek sayfada toplar.`,
    },
    { q: "YKS hazırlığında neler ücretsiz, neler Plus'ta?", a: FREE_AND_PLUS_ANSWER },
  ],
  llmsNote: "TYT ve AYT notundan çalışma yolu, 5 şıklı konu testi, yanlışın ikizi, canlı sesli öğretmen, çizimli özet.",
};

const LGS: ExamLanding = {
  id: "lgs",
  path: "/lgs-hazirlik",
  navLabel: "LGS hazırlık",
  metaTitle: "LGS hazırlık: 8. sınıf için çalışma yolu",
  metaDescription: `8. sınıf öğrencisi için MEB kazanımlarına dayalı LGS çalışma yolu: 4 şıklı konu testi, ${REVIEW_DAYS}. günde tekrar, veliye hesapsız ödeme bağlantısı ve gece sessiz saat.`,
  eyebrow: "LGS · 8. sınıf",
  h1: "LGS'ye hazırlanan 8. sınıf öğrencisi ve veli için",
  definition: [
    "Cortex Plus, LGS'ye hazırlanan 8. sınıf öğrencisinin ders notundan ya da MEB kazanımlarına dayalı hazır müfredattan konu anlatımı, 4 şıklı konu testi ve sınav tarihine göre bir çalışma yolu hazırlayan yapay zekâ öğretmenidir.",
    `Yanlış yapılan sorular ${REVIEW_DAYS} gün sonra yeniden sorulur; veli hesap açmadan, gönderilen ödeme bağlantısıyla paketi alabilir.`,
  ],
  signupHref: "/kayit?hedef=yks-lgs",
  featuresTitle: "Öğrenci ve veli için neler var",
  features: [
    {
      icon: "mufredat",
      title: "MEB kazanımlarına dayalı hazır müfredat",
      body: "Notun yoksa LGS derslerinin MEB 8. sınıf kazanımlarından çıkarılan hazır müfredatından başlarsın; her dersin ünite ve kazanım sayfaları aşağıda.",
    },
    {
      icon: "tekrar",
      title: "Günü gelen tekrar",
      body: `Yanlış yaptığın sorular ve dersin kilit bilgileri ${REVIEW_DAYS} gün sonra yeniden sorulur; hazırlık sayfası o gün kaç tekrarın beklediğini yazar.`,
    },
    {
      icon: "konu-testi",
      title: "LGS biçiminde 4 şıklı sorular",
      body: "Ortaokul ve LGS'de sorular 4 şıklıdır (A–D); her şıkkın neden doğru ya da yanlış olduğu ayrı ayrı açıklanır.",
    },
    {
      icon: "davet",
      title: "Veliye hesapsız ödeme bağlantısı",
      body: `Paket kartındaki “${PARENT_BUTTON_NAME}” düğmesiyle planını veline gönderirsin; velin hesap açmadan ve şifre oluşturmadan bağlantıyı açıp PayTR ile öder. Bağlantı ${PARENT_LINK_TTL_HOURS} saat geçerlidir; velin yalnız adını ve paketi görür, çalışma verini görmez.`,
    },
    {
      icon: "seri",
      title: "Gece sessiz saat",
      body: `Hatırlatma e-postası ve telefon bildirimi Türkiye saatiyle ${QUIET_RANGE} arasında gönderilmez. Hatırlatma saatini ${STUDY_TIMES} olarak seçer, istediğinde kapatırsın.`,
    },
  ],
  programsTitle: "LGS dersleri: MEB kazanımları",
  programsLead: "Her ders MEB'in 8. sınıf öğretim programı kazanımlarından çıkarıldı; ünite ve kazanım sayfaları herkese açık.",
  programIds: [
    "lgs-2027-turkce",
    "lgs-2027-matematik",
    "lgs-2027-fen",
    "lgs-2027-inkilap",
    "lgs-2027-dkab",
    "lgs-2027-ingilizce",
  ],
  faq: [
    {
      q: "Cortex Plus LGS'ye hazırlanan 8. sınıf öğrencisine ne sağlar?",
      a: `Ders notundan ya da MEB kazanımlarına dayalı hazır müfredattan konu anlatımı, 4 şıklı konu testi, kartlar ve sınav tarihine göre bir çalışma yolu hazırlar. Yanlış yapılan sorular ${REVIEW_DAYS} gün sonra yeniden sorulur. Takıldığı yeri yapay zekâ öğretmene yazarak sorar; cevap notuna dayanır.`,
    },
    {
      q: "Konular MEB müfredatına uygun mu?",
      a: "Hazır müfredat MEB'in 8. sınıf öğretim programı kazanımlarından çıkarılır ve her dersin ünite ve kazanım sayfaları herkese açıktır. Kendi notunu yüklersen ders ve sorular senin notundan yazılır. LGS'de sorular 4 şıklıdır.",
      link: { label: "LGS kazanımlarına göz at", href: "/mufredat/lgs-2027-matematik" },
    },
    {
      q: "Veli hesap açmadan nasıl öder?",
      a: `Öğrenci paket kartındaki “${PARENT_BUTTON_NAME}” düğmesiyle bağlantıyı veliye gönderir; veli hesap açmadan ve şifre oluşturmadan bağlantıyı açıp PayTR ile öder. Paket öğrencinin hesabına tanımlanır ve bağlantı ${PARENT_LINK_TTL_HOURS} saat geçerlidir. Veli yalnız öğrencinin adını ve paketi görür.`,
    },
    {
      q: "Çocuğuma gece bildirim gelir mi?",
      a: `Hayır; hatırlatma e-postası ve telefon bildirimi Türkiye saatiyle ${QUIET_RANGE} arasında gönderilmez. Öğrenci hatırlatma saatini ${STUDY_TIMES} olarak seçer ve istediğinde kapatır. Ödeme ve hesap bildirimleri bu kurala tabi değildir.`,
    },
  ],
  llmsNote: "MEB kazanımlarına dayalı hazır müfredat, 4 şıklı konu testi, günü gelen tekrar, veliye hesapsız ödeme bağlantısı, gece sessiz saat.",
};

const KPSS: ExamLanding = {
  id: "kpss",
  path: "/kpss-hazirlik",
  navLabel: "KPSS hazırlık",
  metaTitle: "KPSS hazırlık: kanun, tarih ve coğrafya notundan test",
  metaDescription:
    "KPSS için uzun PDF'ten ve kanun, tarih, coğrafya notundan konu testi, doğru/yanlış ve gün gün çalışma yolu; podcast'lerini Sınav Radyosu'nda kredi harcamadan dinle.",
  eyebrow: "KPSS · Genel Yetenek ve Genel Kültür",
  h1: "KPSS notunu teste ve tekrara çevir",
  definition: [
    "Cortex Plus, KPSS adayının uzun PDF'lerinden ve kanun, tarih, coğrafya notlarından konu anlatımı, 5 şıklı konu testi, doğru/yanlış ve sınav tarihine göre bir çalışma yolu hazırlayan yapay zekâ öğretmenidir.",
    "Plus'ta ürettiğin podcast'ler Sınav Radyosu'nda ek kredi harcamadan art arda çalar; yolda kulaklıkla tekrar edersin.",
  ],
  signupHref: "/kayit?hedef=akademik",
  featuresTitle: "KPSS notun için neler var",
  features: [
    {
      icon: "bos-belge",
      title: "Uzun PDF, parça parça",
      body: `${RANGE_PAGES} sayfayı aşan PDF'te işlenecek sayfa aralığını sen seçersin. Uzun belge parça parça okunur; okunan sayfaların konuları çalışma yoluna eklenir.`,
    },
    {
      icon: "konu-testi",
      title: "Konu testi",
      body: "Kanun maddesi, tarih ve coğrafya bilgisi konu konu 5 şıklı testle sorulur; her şıkkın neden doğru ya da yanlış olduğu açıklanır.",
    },
    {
      icon: "dogru-yanlis",
      title: "Doğru / Yanlış",
      body: "Hızlı kontrol için önermeler; yanlış önermenin altında doğrusu yazar ve aynı bilginin ters çevrilmiş hâli aynı sette sorulmaz.",
    },
    {
      icon: "podcast",
      title: "Sınav Radyosu",
      body: "Sesi hazır podcast'lerin konu sırasıyla art arda çalar; hız 1–2× arası, 15 saniye ileri ve geri, kilit ekranından yönetilir. Radyo yeni ses üretmez, bu yüzden kredi düşmez.",
      chip: "Podcast Plus'ta",
    },
    {
      icon: "mufredat",
      title: "KPSS konu ağacı",
      body: "Notun yoksa Genel Yetenek ve Genel Kültür derslerinin konu ağacından başlarsın; ağaç ÖSYM kılavuzunun test yapısına dayanır, resmî ÖSYM konu listesi değildir.",
    },
  ],
  programsTitle: "Notun yoksa: KPSS konu ağacı",
  programsLead: "ÖSYM kılavuzunun test yapısına dayanan konu ağacı; resmî ÖSYM konu listesi değildir.",
  programIds: [
    "kpss-2026-deep-turkce",
    "kpss-2026-deep-matematik",
    "kpss-2026-deep-tarih",
    "kpss-2026-deep-cografya",
    "kpss-2026-deep-vatandaslik",
    "kpss-2026-tree-guncel",
  ],
  faq: [
    {
      q: "Cortex Plus KPSS hazırlığında ne yapar?",
      a: "Uzun PDF'lerinden ve kanun, tarih, coğrafya notlarından konu anlatımı, 5 şıklı konu testi, doğru/yanlış ve sınav tarihine göre bir çalışma yolu hazırlar. Yanlış yaptığın sorular yanlışlar defterine yazılır ve günü gelince yeniden sorulur. Notun yoksa KPSS konu ağacından başlarsın.",
      link: { label: "KPSS konu ağacına göz at", href: "/mufredat/kpss-2026-deep-tarih" },
    },
    {
      q: "Uzun kanun ve tarih PDF'leri işlenebilir mi?",
      a: `Evet; uzun PDF parça parça okunur ve okunan sayfaların konuları çalışma yoluna eklenir. ${RANGE_PAGES} sayfayı aşan PDF'te işlenecek sayfa aralığını sen seçersin. ${FREE_DOCUMENT_SENTENCE}`,
    },
    {
      q: "Sınav Radyosu nedir, kredi harcar mı?",
      a: "Sınav Radyosu, sesi hazır podcast'lerini konu sırasıyla art arda çalar; yeni ses üretmediği için kredi düşmez. Podcast üretmek Plus'tadır. Hız, 15 saniye ileri-geri ve kilit ekranı kontrolleriyle yolda dinlemeye uygundur.",
    },
    { q: "KPSS hazırlığında neler ücretsiz, neler Plus'ta?", a: FREE_AND_PLUS_ANSWER },
  ],
  llmsNote: "Uzun PDF ve kanun, tarih, coğrafya notundan konu testi ve doğru/yanlış; podcast'leri kredi harcamadan çalan Sınav Radyosu.",
};

const TUS: ExamLanding = {
  id: "tus",
  path: "/tus-hazirlik",
  navLabel: "TUS hazırlık",
  metaTitle: "TUS ve DUS hazırlık: uzun slayt ve PDF'ten soru",
  metaDescription: `TUS, DUS, ALES ve vize-final için ${RANGE_PAGES} sayfayı aşan slayt ve PDF'ten konu anlatımı, vaka sorulu konu testi, kavram kartları ve çift kontrollü soru üretimi.`,
  eyebrow: "TUS · DUS · ALES · vize-final",
  h1: "Yüzlerce sayfalık slayt ve PDF'ten TUS hazırlığı",
  definition: [
    "Cortex Plus, TUS, DUS, ALES ve vize-final adaylarının yüzlerce sayfalık slayt ve PDF notlarından konu anlatımı, 5 şıklı konu testi, kavram kartları ve sınav tarihine göre çalışma yolu hazırlayan yapay zekâ öğretmenidir.",
    "Konu testinin soruları yazıldıktan sonra ikinci bir yapay zekâ kontrolünden ve kod denetiminden geçer; iki doğru cevabı olan ya da hesapla çelişen soru öğrenciye gösterilmez.",
  ],
  signupHref: "/kayit?hedef=tus",
  featuresTitle: "Uzun notun için neler var",
  features: [
    {
      icon: "bos-belge",
      title: "Sayfa aralığı seçimi",
      body: `${RANGE_PAGES} sayfayı aşan PDF'te işlenecek sayfa aralığını (başlangıç ve bitiş sayfası) sen seçersin. Slayt ve Word dosyaları da yüklenir; uzun belge parça parça okunur ve okunan sayfaların konuları yoluna eklenir.`,
    },
    {
      icon: "konu-testi",
      title: "Çift kontrollü soru üretimi",
      body: "Sorular yazıldıktan hemen sonra ikinci bir yapay zekâ kontrolü soruları kendisi çözer, uydurma şıkkı ve yanlış cevap anahtarını düzeltir. Ardından kod, iki doğru cevabı olan ya da hesapla çelişen soruyu eler.",
    },
    {
      icon: "alistirma",
      title: "Vaka soruları",
      body: "Orta ve ileri zorlukta konu testi soruları kısa bir vakayla açılır; vaka kaynaktaki bilginin somut hâlidir, kaynakta olmayan bulgu ya da eşik eklenmez.",
    },
    {
      icon: "kartlar",
      title: "Kavram kartları ve tekrar",
      body: `Kartlar aynı bilgiyi iki kez sormaz; zorlandığın kart önce gelir. Yanlış yaptığın sorular ${REVIEW_DAYS} gün sonra yeniden sorulur.`,
    },
    {
      icon: "mufredat",
      title: "TUS ve DUS konu ağacı",
      body: "Notun yoksa temel ve klinik bilimlerin konu ağacından başlarsın; alt başlıklar YÖK çekirdek eğitim programına dayanır, resmî ÖSYM konu listesi değildir.",
    },
  ],
  programsTitle: "Notun yoksa: TUS, DUS ve ALES konu ağacı",
  programsLead: "ÖSYM kılavuzunun testlerine ve YÖK çekirdek eğitim programına dayanan konu ağacı; resmî ÖSYM konu listesi değildir.",
  programIds: [
    "tus-2026-deep-anatomi",
    "tus-2026-deep-fizyoloji",
    "tus-2026-deep-farmakoloji",
    "tus-2026-deep-patoloji",
    "tus-2026-deep-dahiliye",
    "tus-2026-deep-pediatri",
    "dus-2026-deep-restoratif",
    "dus-2026-deep-endodonti",
    "ales-2026-deep-sayisal",
    "ales-2026-deep-sozel",
  ],
  faq: [
    {
      q: "Cortex Plus TUS hazırlığında ne yapar?",
      a: "Yüzlerce sayfalık slayt ve PDF notundan konu anlatımı, 5 şıklı konu testi, kavram kartları ve sınav tarihine göre bir çalışma yolu hazırlar. Orta ve ileri zorlukta konu testi soruları kısa bir vakayla açılır. Notun yoksa temel ve klinik bilimlerin konu ağacından başlarsın.",
      link: { label: "TUS konu ağacına göz at", href: "/mufredat/tus-2026-deep-farmakoloji" },
    },
    {
      q: `${RANGE_PAGES} sayfadan uzun slayt ve PDF'leri nasıl çalışırım?`,
      a: `${RANGE_PAGES} sayfayı aşan PDF'te işlenecek sayfa aralığını sen seçersin; slayt ve Word dosyaları da yüklenir. Uzun belge parça parça okunur ve okunan sayfaların konuları çalışma yoluna eklenir.`,
    },
    {
      q: "Sorular nasıl kontrol ediliyor?",
      a: "Konu testinin soruları yazıldıktan hemen sonra ikinci bir yapay zekâ kontrolü soruları kendisi çözer, uydurma şıkkı ve yanlış cevap anahtarını düzeltir. Ardından kod, iki doğru cevabı olan ya da hesapla çelişen soruyu öğrenciye göstermeden eler. Bir soruda hata görürsen “Soruda hata bildir” ile bildirirsin.",
    },
    {
      q: "DUS, ALES ve vize-final için de kullanılır mı?",
      a: `Evet; DUS ve ALES için konu ağacından ya da kendi notundan, vize ve final için kendi ders notundan ya da dersin adını yazarak çalışma yolu kurulur. Bu sınavlarda sorular 5 şıklıdır. ${LIVE_VOICE_ACCESS}`,
    },
  ],
  llmsNote: "TUS, DUS, ALES ve vize-final için uzun slayt ve PDF'te sayfa aralığı seçimi, vaka sorulu konu testi, kavram kartları, çift kontrollü soru üretimi.",
};

export const EXAM_LANDINGS: Record<ExamLandingId, ExamLanding> = { yks: YKS, lgs: LGS, kpss: KPSS, tus: TUS };

/** Sayfa sırası (altbilgi, `/sinav-hazirligi`, site haritası, `/llms.txt`). */
export const EXAM_LANDING_LIST: readonly ExamLanding[] = EXAM_LANDING_LINKS.map((link) => EXAM_LANDINGS[link.id]);

/** Tanımın iki cümlesi birlikte. */
export function examLandingSummary(landing: ExamLanding): string {
  return landing.definition.join(" ");
}
