import "server-only";
import { FREE_CHAT_PER_DAY, FREE_PHOTO_PER_MONTH, FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import { FREE_DOCUMENT_SENTENCE, PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";
import { DEFAULT_RANGE_SPAN } from "@/lib/documents/page-coverage";
import { DEFAULT_DAILY_MINUTES } from "@/lib/learning/exam-schedule-v2";
import { REVIEW_LADDER_DAYS } from "@/lib/learning/review-items";
import { GUIDE_LINKS, guidePath, type GuideSlug } from "@/lib/marketing/content-hub-links";
import type { FaqItem } from "@/lib/marketing/landing-content";
import { QUIET_END_HOUR, QUIET_START_HOUR } from "@/lib/notifications/schedule";
import { PARENT_LINK_TTL_HOURS } from "@/lib/payments/parent-link-ttl";
import { AYT_GRADES, LIVE_VOICE_ACCESS, programUnitsForGrades, structureCount, TYT_GRADES } from "@/lib/marketing/subject-hubs";

/*
  Rehber sayfaları (27 Kasım 2026, SEO ve GEO; ürün sahibinin isteği): öğrencilerin arama motoruna ve yapay zekâ
  sohbetlerine birebir sorduğu altı soru. Her rehberde ilk 100 kelimede doğrudan cevap, adım adım plan, üç "cevap önce"
  soru ve ilgili ders ve sınav sayfalarına bağlantı.

  Kurallar (bekçi `ders-rehber-sayfalari.test.tsx`): veri kayıt defterinden (soru sayıları `examStructures`, ünite adları
  ve sırası programlardan, sınıf kapsamı `examGradeScopes`), ürün sözleri koddan (ücretsiz hak, canlı ses erişimi, tekrar
  günleri, sayfa aralığı eşiği, veli bağlantısı süresi, gece sessiz saati). Sabit fiyat, rakip adı, uydurma istatistik yok.
  Seçim rehberindeki ölçütler tarafsızdır; "Cortex Plus'ta" sütunu yalnız bugün çalışan işi yazar.
*/

export const GUIDE_PUBLISHED = "2026-11-27";

export type GuideStep = { title: string; body: string };
export type GuideRelated = { href: string; label: string };

export type Guide = {
  slug: GuideSlug;
  path: string;
  /** Rehberin sorusu (h1 ve Article başlığı). */
  question: string;
  metaTitle: string;
  metaDescription: string;
  /** İlk 100 kelimedeki doğrudan cevap (iki ya da üç cümle). */
  answer: string;
  steps: readonly GuideStep[];
  /** Veri bloğu: kayıt defterinden liste (örneğin ünite sırası). */
  list?: { title: string; items: readonly string[]; source: string };
  /** Tarafsız ölçüt tablosu. */
  table?: { caption: string; head: readonly [string, string, string]; rows: ReadonlyArray<readonly [string, string, string]> };
  faq: readonly FaqItem[];
  related: readonly GuideRelated[];
  llmsNote: string;
};

const REVIEW_DAYS = (() => {
  const days = REVIEW_LADDER_DAYS.map(String);
  return `${days.slice(0, -1).join(", ")} ve ${days[days.length - 1]}`;
})();
const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const QUIET_RANGE = `${clock(QUIET_START_HOUR)}–${clock(QUIET_END_HOUR)}`;
const lowerFirst = (text: string) => `${text.charAt(0).toLocaleLowerCase("tr")}${text.slice(1)}`;
/** Sınıf kapsamı kayıt defterinden (`examGradeScopes`). */
const GRADE_SCOPES = { TYT: TYT_GRADES, AYT: AYT_GRADES } as const;

function count(exam: string, ...subjects: string[]): number {
  const value = structureCount(exam, subjects);
  if (value == null) throw new Error(`Sınav yapısında yok: ${exam} ${subjects.join(", ")}`);
  return value;
}

function buildGuides(): Record<GuideSlug, Guide> {
  const tytMath = count("TYT", "Temel Matematik");
  const aytChem = count("AYT", "Kimya");
  const tytChem = count("TYT", "Kimya");
  const tytMathUnits = programUnitsForGrades("yks-2026-matematik", GRADE_SCOPES.TYT);
  const aytChemUnits = programUnitsForGrades("yks-2026-kimya", GRADE_SCOPES.AYT);
  const baseChemUnits = programUnitsForGrades("yks-2026-kimya", GRADE_SCOPES.TYT);
  const freeLower = lowerFirst(FREE_TIER_SENTENCE);

  const program: Guide = {
    slug: "ders-notundan-calisma-programi-nasil-yapilir",
    path: guidePath("ders-notundan-calisma-programi-nasil-yapilir"),
    question: "Ders notundan çalışma programı nasıl yapılır?",
    metaTitle: "Ders notundan çalışma programı nasıl yapılır?",
    metaDescription:
      "Ders notunu konulara böl, sınav gününe kadar günlere dağıt, her konuyu anlatım, test ve aralıklı tekrarla çalış. Adım adım plan ve Cortex Plus ile otomatik program.",
    answer: `Ders notundan çalışma programı yapmak için notu konulara böl, konuları sınav gününe kadar kalan günlere dağıt ve her konuyu anlatım, test ve aralıklı tekrar sırasıyla çalış. Cortex Plus bu adımları notundan kendisi kurar: PDF, slayt, Word ya da defter fotoğrafını yüklersin, konular çıkarılır ve sınav tarihine göre gün gün bir çalışma yolu oluşur.`,
    steps: [
      {
        title: "Sınav tarihini ve günlük süreni belirle",
        body: `Kaç gün kaldığını ve günde ne kadar çalışabileceğini yaz. Cortex Plus'ta süre seçmezsen günlük ${DEFAULT_DAILY_MINUTES} dakika ve haftanın her günü varsayılır; istediğin zaman değiştirirsin.`,
      },
      {
        title: "Notu konulara ayır",
        body: "Notun başlıklarını ve bölümlerini çıkar; her başlık bir konu olsun. Cortex Plus belgenin kendi başlıklarını ve bölümlerini okuyup konuları ünitelere toplar.",
      },
      {
        title: "Konuları sıraya koy",
        body: "Önce başka konuların temeli olan konuları, sonra notun sırasını izle. Cortex Plus da önkoşulu önce koyar, gerisinde belgenin sırasını korur.",
      },
      {
        title: "Her konuyu üç adımda çalış",
        body: "Önce kısa bir konu anlatımı, ardından konu testi, sonra kartlarla tekrar. Testte zorlandığın konuya odaklı pratik eklenir.",
      },
      {
        title: "Yanlışları aralıklı tekrar et",
        body: `Yanlış yaptığın soruyu ${REVIEW_DAYS} gün sonra yeniden çöz; doğru cevabı ezberlemeden hatırlayabiliyorsan konu oturmuştur.`,
      },
      {
        title: "Programı kaçırınca yeniden dağıt",
        body: "Bir günü kaçırmak programı bozmaz; kalan konuları kalan günlere yeniden dağıt. Cortex Plus kaçırılan günleri hazırlık sayfasını açtığında yeniden dağıtır.",
      },
    ],
    faq: [
      {
        q: "El yazısı defter fotoğrafından program çıkar mı?",
        a: "Evet; defter sayfalarının fotoğrafını yüklersin, birden çok fotoğraf tek belgede birleşir ve el yazısı okunur. Bulanık ya da karanlık fotoğrafta yüklemeden önce uyarılırsın.",
      },
      {
        q: "Sınava çok az gün kaldıysa program nasıl olur?",
        a: "Konular kalan günlere süre ve sırayla paylaştırılır; bir haftadan kısa planda günler “Bugün, Yarın” diye adlandırılır. Her konunun en az bir testi olur.",
      },
      {
        q: "Bunu ücretsiz deneyebilir miyim?",
        a: `Evet, kart istenmez: ${freeLower} açık. ${FREE_DOCUMENT_SENTENCE}`,
      },
    ],
    related: [
      { href: "/ders/matematik", label: "Matematik" },
      { href: "/ders/biyoloji", label: "Biyoloji" },
      { href: "/yks-hazirlik", label: "YKS hazırlık" },
      { href: "/lgs-hazirlik", label: "LGS hazırlık" },
      { href: "/kpss-hazirlik", label: "KPSS hazırlık" },
    ],
    llmsNote: "Notu konulara bölme, günlere dağıtma, anlatım-test-tekrar sırası ve kaçırılan günü yeniden dağıtma.",
  };

  const tyt: Guide = {
    slug: "tyt-matematik-netleri-nasil-artar",
    path: guidePath("tyt-matematik-netleri-nasil-artar"),
    question: "TYT matematik netleri nasıl artar?",
    metaTitle: "TYT matematik netleri nasıl artar? Adım adım plan",
    metaDescription: `TYT'de ${tytMath} Temel Matematik sorusu var. Netleri artırmak için yanlışları konuya göre ölç, temel konuları kapat, benzer soruyla dene ve aralıklı tekrar et.`,
    answer: `TYT'de ${tytMath} Temel Matematik sorusu var ve dört yanlış bir doğruyu götürür; bu yüzden netler önce yanlış sayısı azalınca artar. Yanlışlarını konuya göre ölç, en çok yanlış veren temel konuyu anlatım ve benzer soruyla kapat, aynı soruyu günler sonra yeniden çöz.`,
    steps: [
      {
        title: "Yanlışlarını konuya göre say",
        body: "Son denemelerindeki yanlış ve boşları konu konu listele; en çok kaybettiren üç konuyu seç. Tek tek soru değil, konu düzeyinde düşün.",
      },
      {
        title: "Önce temel konuları kapat",
        body: `TYT matematiği ağırlıkla 9. ve 10. sınıf kazanımlarından gelir; ${tytMathUnits.slice(0, 3).join(", ")} gibi ilk üniteler sonraki konuların temelidir.`,
      },
      {
        title: "Her yanlışın ikizini çöz",
        body: "Bir soruyu yanlış yaptıktan sonra aynı kavramı sayıları değişmiş bir soruyla hemen dene. Cortex Plus'ta konu testinde yanlışın altından ikiz soruyu açarsın.",
      },
      {
        title: "Çözümü adım adım kontrol et",
        body: "Takıldığın sorunun fotoğrafını çekip adım adım çözüm al; kendi çözümünü gönderirsen ilk hatalı satırın gösterilir. Hata işlemde mi, kavramda mı, bunu ayır.",
      },
      {
        title: "Aralıklı tekrar et",
        body: `Yanlış yaptığın soruları ${REVIEW_DAYS} gün sonra yeniden çöz. Günü gelen tekrar listesi bunu senin yerine hatırlar.`,
      },
      {
        title: "Haftada bir deneme ile ölç",
        body: "Her hafta aynı koşullarda bir deneme çöz ve yanlış listesini güncelle; plan bir sonraki haftanın konularını buna göre seçer.",
      },
    ],
    list: {
      title: "TYT matematik kapsamındaki üniteler (9. ve 10. sınıf)",
      items: tytMathUnits,
      source: "MEB'in YKS'ye esas kazanımları (kayıt defteri sırasıyla)",
    },
    faq: [
      {
        q: "TYT'de kaç matematik sorusu var?",
        a: `TYT'de ${tytMath} Temel Matematik sorusu var (ÖSYM 2026 kılavuzu). AYT Matematik testi ayrıca ${count("AYT", "Matematik")} soru sorar.`,
      },
      {
        q: "TYT neti nasıl hesaplanır?",
        a: "Net, doğru sayısından yanlış sayısının dörtte biri çıkarılarak bulunur; boş bırakılan soru neti düşürmez. Örneğin 30 doğru ve 8 yanlışta net 28'dir.",
      },
      {
        q: "Cortex Plus TYT matematiğe nasıl yardım eder?",
        a: `Notundan ya da MEB kazanımlarından konu anlatımı, 5 şıklı konu testi ve sınav tarihine göre çalışma yolu kurar; yanlışın ikizini ve günü gelen tekrarı verir. ${LIVE_VOICE_ACCESS}`,
        link: { label: "Matematik sayfasına git", href: "/ders/matematik" },
      },
    ],
    related: [
      { href: "/ders/matematik", label: "Matematik" },
      { href: "/yks-hazirlik", label: "YKS hazırlık" },
      { href: guidePath("gece-ders-calisirken-takilan-soru-cozumu"), label: "Takılan soru nasıl çözülür" },
    ],
    llmsNote: `TYT'de ${tytMath} Temel Matematik sorusu; yanlışları konuya göre ölçme, temel konular, ikiz soru, aralıklı tekrar.`,
  };

  const ayt: Guide = {
    slug: "ayt-kimya-calisma-sirasi-ve-konulari",
    path: guidePath("ayt-kimya-calisma-sirasi-ve-konulari"),
    question: "AYT kimya hangi sırayla çalışılır, konuları neler?",
    metaTitle: "AYT kimya çalışma sırası ve konuları",
    metaDescription: `AYT Fen Bilimleri testinde ${aytChem} kimya sorusu var. 11. ve 12. sınıf kimya ünitelerinin önerilen çalışma sırası ve temel olan 9. ve 10. sınıf konuları.`,
    answer: `AYT Fen Bilimleri testinde ${aytChem} kimya sorusu var ve sorular ağırlıkla 11. ve 12. sınıf konularından gelir. Önerilen sıra müfredatın kendi sırasıdır: ${aytChemUnits.slice(0, 3).join(", ")} ile başlayıp ${aytChemUnits.slice(-2).join(" ve ")} ile biter; 9. ve 10. sınıftaki mol ve karışım konuları bu ünitelerin temelidir.`,
    steps: [
      {
        title: "Temeli tamamla",
        body: `Önce 9. ve 10. sınıf konularındaki eksiğini kapat: ${baseChemUnits.slice(0, 3).join(", ")} ve ${baseChemUnits.length - 3} ünite daha. TYT'deki ${tytChem} kimya sorusu da bu konulardan gelir.`,
      },
      {
        title: "11. sınıf ünitelerini sırayla çalış",
        body: "Modern atom teorisinden başla; gazlar ve çözeltiler hesap ağırlıklıdır, enerji, hız ve denge birbirinin üstüne kurulur.",
      },
      {
        title: "12. sınıf ünitelerine geç",
        body: "Elektrokimyadan sonra karbon kimyası ve organik bileşiklere geç; adlandırma ve fonksiyonel grupları kartlarla tekrar et.",
      },
      {
        title: "Hesap sorularını adım adım çöz",
        body: "Her hesapta verilenleri birimleriyle yaz, bağıntıyı seç, sayıları en sonda yerleştir. Cortex Plus derslerinde formüller ayrı bir formül kartında gösterilir.",
      },
      {
        title: "Yanlışları tekrar et",
        body: `Yanlış yaptığın kimya sorularını ${REVIEW_DAYS} gün sonra yeniden çöz.`,
      },
    ],
    list: {
      title: "AYT kimya üniteleri (11. ve 12. sınıf, önerilen sıra)",
      items: aytChemUnits,
      source: "MEB'in YKS'ye esas kazanımları (kayıt defteri sırasıyla)",
    },
    faq: [
      {
        q: "AYT'de kaç kimya sorusu var?",
        a: `AYT Fen Bilimleri testinde ${aytChem} kimya sorusu var; TYT'de ayrıca ${tytChem} kimya sorusu sorulur (ÖSYM 2026 kılavuzu).`,
      },
      {
        q: "AYT kimyaya 9. sınıf konuları girer mi?",
        a: "AYT kimya soruları ağırlıkla 11. ve 12. sınıf konularından gelir, ancak mol hesabı ve karışımlar gibi 9. ve 10. sınıf konuları bu soruların temelidir. Temel eksikse önce onu kapatmak daha az zaman kaybettirir.",
      },
      {
        q: "Cortex Plus AYT kimyada nasıl kullanılır?",
        a: "Kendi kimya notunu yüklersin ya da MEB kazanımlarından başlarsın; her ünite için formül kartlı ders, konu testi ve kartlar hazırlanır. Takıldığın hesap sorusunun fotoğrafından adım adım çözüm gelir.",
        link: { label: "Kimya sayfasına git", href: "/ders/kimya" },
      },
    ],
    related: [
      { href: "/ders/kimya", label: "Kimya" },
      { href: "/yks-hazirlik", label: "YKS hazırlık" },
      { href: "/mufredat/yks-2026-kimya", label: "YKS kimya kazanımları" },
    ],
    llmsNote: `AYT'de ${aytChem} kimya sorusu; 11. ve 12. sınıf ünitelerinin müfredat sırası ve temel 9. ve 10. sınıf konuları.`,
  };

  const vize: Guide = {
    slug: "vize-haftasi-slayt-ozetleme-taktikleri",
    path: guidePath("vize-haftasi-slayt-ozetleme-taktikleri"),
    question: "Vize haftasında slaytlar nasıl özetlenir?",
    metaTitle: "Vize haftası slayt özetleme taktikleri",
    metaDescription:
      "Vize haftasında slaytları özetlemek için kapsamı ayır, her slayt grubunu tek ana fikre indir ve özeti soruyla sına. Uzun PDF ve sunularla adım adım plan.",
    answer: `Vize haftasında slaytları özetlemek için önce sınav kapsamını ayır, her slayt grubunu tek cümlelik ana fikre indir ve özeti hemen soruyla sına. Cortex Plus slaytlarını (PDF ya da sunu) okuyup konulara ayırır; her konu için kısa ders, konu testi ve kartlar hazırlar.`,
    steps: [
      {
        title: "Kapsamı ayır",
        body: "Hocanın “vizede yok” dediği bölümleri baştan çıkar. Notunda “vizede sorulmayacak” gibi bir ifade varsa Cortex Plus o konuyu kapsam dışı işaretler ve hazırlığa almaz.",
      },
      {
        title: "Slaytları tek seferde yükle",
        body: `Bütün haftaların slaytlarını birlikte yükle. ${DEFAULT_RANGE_SPAN} sayfayı aşan PDF'te işlenecek sayfa aralığını sen seçersin; sunudaki resim ve şemalar da okunur.`,
      },
      {
        title: "Her slayt grubunu bir ana fikre indir",
        body: "Bir konunun slaytlarını tek cümleyle anlatabiliyorsan konuyu anlamışsındır. Ders ekranları da her kavramı kısa ekranlarla ve bir soruyla bitirir.",
      },
      {
        title: "Özeti soruyla sına",
        body: "Okuduğunu hemen konu testi ve doğru/yanlış ile sına; yanlış önermenin altında doğrusu yazar.",
      },
      {
        title: "Kartlarla tekrar et",
        body: "Terimleri ve tanımları kartlara dök; zorlandığın kart önce gelir.",
      },
      {
        title: "Sınav sabahı tek sayfaya bak",
        body: `Sınavdan önceki sabah formüller, sınav tuzakları ve en çok yanıldığın noktalar tek kâğıtta. ${PLUS_ONLY_SENTENCE}`,
      },
    ],
    faq: [
      {
        q: "Slaytlarda resim ve şema varsa okunur mu?",
        a: "Evet; sunu ve Word dosyalarındaki resimler okunur, PDF'teki şekilli sayfa derste “Belgedeki Şema” kartıyla açılır.",
      },
      {
        q: "Yüzlerce sayfalık slayt da işlenir mi?",
        a: `Evet; uzun belge parça parça okunur ve okunan sayfaların konuları çalışma yoluna eklenir. ${DEFAULT_RANGE_SPAN} sayfayı aşan PDF'te işlenecek sayfa aralığını sen seçersin.`,
      },
      {
        q: "Vize için ücretsiz kullanılabilir mi?",
        a: `Evet, kart istenmez: ${freeLower} açık. ${FREE_DOCUMENT_SENTENCE}`,
      },
    ],
    related: [
      { href: "/tus-hazirlik", label: "TUS, DUS, ALES ve vize-final" },
      { href: "/ders/biyoloji", label: "Biyoloji" },
      { href: "/ders/tarih", label: "Tarih" },
      { href: guidePath("ders-notundan-calisma-programi-nasil-yapilir"), label: "Ders notundan çalışma programı" },
    ],
    llmsNote: "Kapsamı ayırma, slaytları tek ana fikre indirme, soruyla sınama, kartlar ve sınav sabahı kâğıdı.",
  };

  const gece: Guide = {
    slug: "gece-ders-calisirken-takilan-soru-cozumu",
    path: guidePath("gece-ders-calisirken-takilan-soru-cozumu"),
    question: "Gece ders çalışırken takıldığım soruyu nasıl çözerim?",
    metaTitle: "Gece ders çalışırken takılan soru nasıl çözülür?",
    metaDescription: `Gece takıldığın sorunun fotoğrafını çek ya da yaz; adım adım çözüm ve her şıkkın açıklaması gelsin. Ücretsiz hesapta ayda ${FREE_PHOTO_PER_MONTH} fotoğraftan soru çözümü.`,
    answer: `Gece çalışırken takıldığın soruyu fotoğrafını çekerek ya da yazarak Cortex Plus'a sorarsın; adım adım çözüm gelir ve şıklı soruda her şıkkın neden doğru ya da yanlış olduğu açıklanır. Ücretsiz hesapta ayda ${FREE_PHOTO_PER_MONTH} fotoğraftan soru çözümü ve günde ${FREE_CHAT_PER_DAY} sohbet mesajı var.`,
    steps: [
      {
        title: "Fotoğrafı net çek",
        body: "Soruyu düz ve aydınlık bir yerde çek. Fotoğraf bulanık ya da karanlıksa yüklemeden önce uyarılırsın.",
      },
      {
        title: "Tek soruyu gönder",
        body: "Fotoğrafta birden çok soru varsa yalnız biri çözülür; hangisini istediğini nota yaz.",
      },
      {
        title: "Çözümü adım adım oku",
        body: "Her adımda neden o işlemin yapıldığını anla; yalnız sonucu kopyalama. Emin olunamayan çözümde bu açıkça söylenir.",
      },
      {
        title: "Kendi çözümünü kontrol ettir",
        body: "Kendi yazdığın çözümün fotoğrafını gönderirsen doğru satırların onaylanır, ilk hatalı satırın gösterilir.",
      },
      {
        title: "Ertesi gün yeniden çöz",
        body: `Soru çözücüyü hazırlık sayfasından açtıysan şıklı soruyu o hazırlığın tekrar listesine eklersin; ${REVIEW_DAYS} gün sonra yeniden sorulur.`,
      },
    ],
    faq: [
      {
        q: "Gece bildirim gelip uykumu bölür mü?",
        a: `Hayır; hatırlatma e-postası ve telefon bildirimi Türkiye saatiyle ${QUIET_RANGE} arasında gönderilmez. Ödeme ve hesap bildirimleri bu kurala tabi değildir.`,
      },
      {
        q: "Soruyu sesli olarak sorabilir miyim?",
        a: `${LIVE_VOICE_ACCESS} Ücretsiz hesapta soruyu yazarak ya da fotoğrafla sorarsın.`,
      },
      {
        q: "Çözüm yanlış görünürse ne yapmalıyım?",
        a: "Öğretmen sohbetinde yanıtın altındaki “Bildir” ile yanlış bilgiyi bildirirsin; bildirim destek listemize düşer. Çözümü bir de kendi çözümünle karşılaştırmak hatayı bulmayı kolaylaştırır.",
      },
    ],
    related: [
      { href: "/ders/matematik", label: "Matematik" },
      { href: "/ders/fizik", label: "Fizik" },
      { href: "/ders/kimya", label: "Kimya" },
      { href: "/yks-hazirlik", label: "YKS hazırlık" },
    ],
    llmsNote: `Fotoğraftan ya da yazarak adım adım çözüm, el yazısı çözüm kontrolü, ücretsiz hesapta ayda ${FREE_PHOTO_PER_MONTH} fotoğraf.`,
  };

  const secim: Guide = {
    slug: "sinav-hazirlik-uygulamasi-nasil-secilir",
    path: guidePath("sinav-hazirlik-uygulamasi-nasil-secilir"),
    question: "Sınav hazırlık uygulaması nasıl seçilir?",
    metaTitle: "Sınav hazırlık uygulaması nasıl seçilir? 8 ölçüt",
    metaDescription:
      "Sınav hazırlık uygulaması seçerken içeriğin kaynağına, soru denetimine, sınav biçimine, kişisel programa, tekrara, ücretsiz denemeye, fiyata ve veri gizliliğine bak.",
    answer: `Bir sınav hazırlık uygulaması seçerken içeriğin kendi notundan ya da resmî kazanımlardan gelip gelmediğine, soruların denetlenip denetlenmediğine, sınavının biçimine uyup uymadığına, fiyatın ve yenilemenin açık olup olmadığına ve kişisel verinin nasıl işlendiğine bak. Aşağıdaki sekiz ölçütü her uygulamaya aynı sırayla uygula.`,
    steps: [
      { title: "Kendi notunla dene", body: "Gerçek bir ders notunu ya da sınav konunu ver; çıkan içeriğin notunla örtüşüp örtüşmediğine bak." },
      { title: "Soruları kontrol et", body: "Birkaç sorunun anahtarını kendin çöz; iki doğru cevabı olan ya da yanlış anahtarlı soru var mı bak." },
      { title: "Sınav biçimine bak", body: "Şık sayısı, soru türü ve süre sınavınla aynı mı; ortaokul ve LGS'de 4, lise ve sonrasında 5 şık olmalı." },
      { title: "Fiyatı ve yenilemeyi oku", body: "Fiyat açık mı, ödeme dönemi ne, abonelik kendiliğinden yenileniyor mu ve nasıl iptal edilir; satın almadan önce öğren." },
      { title: "Veri politikasını oku", body: "Notların ve cevapların nasıl işlendiğini, hesabını nasıl sileceğini aydınlatma metninden kontrol et." },
    ],
    table: {
      caption: "Sınav hazırlık uygulaması seçim ölçütleri",
      head: ["Ölçüt", "Neye bakmalı", "Cortex Plus'ta"],
      rows: [
        ["İçeriğin kaynağı", "Ders ve sorular senin notundan mı, genel bir havuzdan mı geliyor?", "Notundan; notun yoksa MEB ve ÖSYM kazanımlarından. Notta olmayan bilgi “Genel bilgi” diye etiketlenir."],
        ["Soru denetimi", "Yanlış anahtarlı ya da iki doğrulu soru eleniyor mu?", "Sorular yazıldıktan sonra ikinci bir yapay zekâ kontrolünden ve kod denetiminden geçer; hatalı soruyu “Soruda hata bildir” ile bildirirsin."],
        ["Sınav biçimi", "Şık sayısı ve soru türü sınavınla aynı mı?", "Ortaokul ve LGS'de 4, lise, YKS, KPSS ve üniversitede 5 şık."],
        ["Kişisel program", "Sınav tarihine göre gün gün plan var mı, kaçırılan gün ne oluyor?", "Sınav tarihine göre çalışma yolu; kaçırılan günler yeniden dağıtılır."],
        ["Tekrar", "Yanlışlar aralıklı olarak yeniden soruluyor mu?", `Yanlışlar ${REVIEW_DAYS} gün sonra yeniden sorulur; yanlışlar defteri ve ikiz soru var.`],
        ["Ücretsiz deneme", "Kart istemeden gerçekten denenebiliyor mu?", `Kart istenmez; ${freeLower} açık.`],
        ["Fiyat ve yenileme", "Fiyat açık mı, abonelik kendiliğinden yenileniyor mu?", "Güncel fiyatlar fiyat sayfasında; web'den alınan paket kendiliğinden yenilenmez. Veli hesap açmadan ödeme bağlantısıyla ödeyebilir."],
        ["Veri ve gizlilik", "Aydınlatma metni, veri silme ve gece bildirimi", `KVKK aydınlatma metni açık; hesap giriş yapmadan da silinebilir; bildirimler ${QUIET_RANGE} arasında gönderilmez.`],
      ],
    },
    faq: [
      {
        q: "Ücretsiz uygulama sınav hazırlığına yeter mi?",
        a: "Yeterli olup olmadığını kendi notunla deneyerek anlarsın: ücretsiz sürümde içeriğin kalitesini, soruların doğruluğunu ve sınav biçimini görebilmelisin. Satın almadan önce neyin ücretli olduğunu açıkça okuyabilmelisin.",
      },
      {
        q: "Velim ödeme yapmak isterse ne yapmalı?",
        a: `Cortex Plus'ta paket kartındaki bağlantıyla velin hesap açmadan PayTR ile öder ve paket senin hesabına tanımlanır. Bağlantı ${PARENT_LINK_TTL_HOURS} saat geçerlidir.`,
      },
      {
        q: "Kişisel verilerim ne oluyor?",
        a: "Verinin hangi amaçla işlendiği KVKK aydınlatma metninde yazılıdır. Hesabını ayarlardan ya da giriş yapmadan hesap silme sayfasından kalıcı olarak silebilirsin.",
        link: { label: "KVKK aydınlatma metni", href: "/kvkk" },
      },
    ],
    related: [
      { href: "/fiyatlandirma", label: "Fiyatlandırma" },
      { href: "/ozellikler", label: "Özellikler" },
      { href: "/ornek", label: "Örnek ders" },
      { href: "/yks-hazirlik", label: "YKS hazırlık" },
      { href: "/kpss-hazirlik", label: "KPSS hazırlık" },
    ],
    llmsNote: "Tarafsız sekiz ölçüt: içeriğin kaynağı, soru denetimi, sınav biçimi, kişisel program, tekrar, ücretsiz deneme, fiyat ve yenileme, veri gizliliği.",
  };

  return {
    "ders-notundan-calisma-programi-nasil-yapilir": program,
    "tyt-matematik-netleri-nasil-artar": tyt,
    "ayt-kimya-calisma-sirasi-ve-konulari": ayt,
    "vize-haftasi-slayt-ozetleme-taktikleri": vize,
    "gece-ders-calisirken-takilan-soru-cozumu": gece,
    "sinav-hazirlik-uygulamasi-nasil-secilir": secim,
  };
}

export const GUIDES: Record<GuideSlug, Guide> = buildGuides();
export const GUIDE_LIST: readonly Guide[] = GUIDE_LINKS.map((link) => GUIDES[link.slug]);
