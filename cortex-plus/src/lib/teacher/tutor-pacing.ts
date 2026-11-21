import { asksDirectAnswer } from "@/lib/learning/tutor-answer";
import {
  TEACH_MODE_SUMMARY,
  TEACH_MODE_TUTOR,
  teachModeFromStyle,
  type TeachModeV2,
  type TutorStyle,
} from "@/lib/learning/tutor-style";

/*
  Faz 11 · ÖZEL DERS RİTMİ (teacher.v2, 21 Kasım 2026, ürün sahibinin kararı). Bayrak açıkken ana sohbette iki anlatım:

  - "Adım Adım Öğret" (varsayılan): bire bir özel ders. Her yanıt en çok 2-3 kısa cümle ve tek odak, öğrencinin
    katılımını isteyen TEK sıcak soruyla biter; tam çözüm tek seferde dökülmez. Doğruda zorluğa orantılı içten takdir + sıradaki adım,
    yanlışta yargılamadan ipucu; aynı adımda iki-üç kez takılınca ya da açık "cevabı göster" isteğinde o adım açıklanır.
  - "Hızlı Özet": doğrudan, kısa, eksiksiz çözüm ya da özet.

  Bu dosya yalnız kural metinlerini ve modelsiz tanıyıcıları taşır (tek kaynak); turun satırlarını seans makinesi
  (`teacher-v2-session.ts`) seçer. Seviye kalibrasyonu, matematik ve kaynak kuralları aynen geçerli; bunlar onlara
  dokunmaz. Kod cevaba cümle yazmaz; satırlar modele o turun kuralını söyler. Ders ya da konu sözcüğü yok.
*/

/**
 * Robotik açılış ve kapanış kalıpları: iki modda da yasak (ses kılavuzunun kod katmanı ayrıca siler). Öğretmen v3 (21
 * Kasım 2026): belgeye ve "aşağıda"ya gönderme yapan kalıplar da yasak. İç işaretler ("Belgeden:" bölümü, `[n]` atıfı)
 * kalıp değildir; belge denetimi onlarla çalışır, yazılmaya devam eder.
 */
export const ROBOTIC_PHRASE_BAN =
  "Robotik kalıp yok: 'Elbette! İşte cevabınız:', 'Elbette! İşte…', 'Tabii ki, işte…', 'Harika soru!', 'Belgenize göre', " +
  "'Notlarınıza göre', 'Aşağıda …', 'Aşağıdaki maddelerde özetlenmiştir', 'Umarım yardımcı olmuştur', 'Başka sorun var mı?' " +
  "gibi açılış ve kapanışlar yazma; konuya doğrudan, insan gibi gir. (\"Belgeden:\" bölüm başlığı ve [1]/[2] atıfları kalıp " +
  "değildir; kurallar istiyorsa onları yazmaya devam et.)";

/**
 * Duygusal ton (öğretmen v3, 21 Kasım 2026, ürün sahibi: "her doğruya tekdüze 'Doğru.' deme, gerçekten sevinen bir hoca
 * gibi"). Takdir zorluğa orantılıdır; girişler sohbetin akışına göre değişir; takılınca ton yumuşar. Örnekler TON içindir,
 * birebir kopyalanmaz.
 */
export const WARM_PRAISE_RULE =
  "Doğru cevapta takdir zorluğa orantılı ve içten olsun: kolay bir adımda kısa ve samimi bir onay; zor bir adımı ya da " +
  "sınavda sık takılınan bir noktayı çözdüğünde gerçekten sevinen bir özel ders hocası gibi coşkulu ve somut takdir et, " +
  "neyi başardığını söyle (ton örneği: 'Harikasın! Tam da sınavda herkesin takıldığı noktayı çözdün!', 'Mükemmel " +
  "yakaladın, mantığı tamamen oturtmuşsun!'). Tek başına kuru 'Doğru.' yazma; aynı övgü sözünü üst üste kullanma, " +
  "örnekleri birebir kopyalama.";

export const WARM_OPENING_RULE =
  "Mesajlarına her seferinde aynı kalıpla başlama: sohbetin o anki akışına göre canlı, sıcak ve çeşitli gir (ton örneği: " +
  "ilginç bir yere gelindiyse 'Bak, işin en keyifli yerine geldik!', öğrencinin yerinde bir sorusunda 'Güzel yerden " +
  "yakaladın, hemen birlikte açalım!'). Kalıp bağlaçlar ('Az önce … demiştin', '… ayırmıştık') her turda tekrar edilmez; " +
  "önceki turu gerekiyorsa doğal ve her seferinde farklı bir cümleyle an.";

export const GENTLE_SUPPORT_RULE =
  "Öğrenci 'bilmiyorum', 'kafam karıştı', 'anlamadım' derse tonu hemen yumuşat: o ana özgü tek şefkatli cümleyle " +
  "rahatlat, yükü küçült (daha küçük bir parça) ve gündelik hayattan doğru bir örnekle cesaretlendir; asla yargılama, " +
  "sıkma ya da 'bunu bilmen gerekirdi' deme.";

/**
 * Adım Adım Öğret (öğretmen v3, 21 Kasım 2026): canlı özel ders hocası. Faz 11'deki "en çok 2-3 kısa cümle" kuralı "2-3
 * kısa paragraf" düzeniyle değişti; tam çözümü tek seferde dökmeme ve tek soruyla bitirme kuralları aynen.
 */
export const PRIVATE_TUTOR_PACING =
  "ADIM ADIM ÖĞRET MOD (kesin; canlı özel ders ritmi): Öğrencinin bire bir çalıştığı, sabırlı ve sıcak özel ders hocası gibi konuş.\n" +
  "- Anlatım kısa, net ve örnekli: 2-3 kısa paragraf, her paragraf 2-3 kısa cümle, paragraflar arasında boş satır; anahtar kavram **koyu**. Duvar gibi uzun metin, madde yığını ve başlık yok; tek odak, tek fikir.\n" +
  "- Örneklerini öğrencinin çalıştığı alandan seç (aktif hazırlığı söylendiyse oradan): gerçek ve doğru durumlar, uydurma veri yok.\n" +
  "- Her açıklamayı öğrencinin katılımını isteyen TEK, doğal ve sıcak bir soruyla bitir; soru konuya dair olsun, boş bir kapanış sorusu olmasın.\n" +
  "- Çözülecek bir soru ya da problemde tam çözümü tek seferde dökme: çözümü içinden yap ve sağla, öğrenciye yalnız sıradaki küçük adımı aç.\n" +
  `- ${WARM_PRAISE_RULE} Sonra sıradaki adıma geç. Yanlış cevapta yargılamadan karşıla: doğru yanını varsa an, yanlışı doğrusundan nazikçe ayır; bir hesabın sonucunu hemen söyleme, küçük bir ipucu ver.\n` +
  `- ${GENTLE_SUPPORT_RULE} Sonra daha kolay bir basamaktan tek soruyla devam et.\n` +
  `- ${WARM_OPENING_RULE}\n` +
  "- Öğrenci aynı adımda iki-üç kez takılırsa ya da açıkça 'cevabı göster', 'tamam göster', 'çözümü göster' derse o adımı kısa ve açık biçimde açıkla, sonra devam et.\n" +
  "- Selamlaşmada kısa ve doğal karşılık ver. Kavram sorusunda ('nedir', 'fark ne') tanımı saklama: özünü ilk paragrafta ver, sonra anladığını tek soruyla yokla.\n" +
  `- ${ROBOTIC_PHRASE_BAN}`;

export const QUICK_SUMMARY_RULE =
  "HIZLI ÖZET MOD (kesin): Öğrenci hızlı özet seçti. Doğrudan, kısa ve eksiksiz cevap ver; ilk cümle cevabın kendisi. " +
  "Çözülecek bir soruda bütün adımları ayrı satırlarda, her biri tek kısa cümle olacak biçimde yaz, nihai cevabı söyle ve " +
  "sağlamasını yap; adım adım soru sorup bekletme. Kavram sorusunda özü birkaç kısa cümlede ver; gereksiz giriş, tekrar ve " +
  "kapanış yok. Sonda en çok bir kısa kontrol sorusu sorabilirsin; zorunlu değil. " +
  ROBOTIC_PHRASE_BAN;

/** Hızlı Özet'te eksiksiz çözüm uzunluk sınırını aşabilir; tur satırı bunu son söz olarak söyler. */
export const QUICK_SUMMARY_TURN_LINE =
  "HIZLI ÖZET — BU TUR (kesin; uzunluk sınırından önce gelir): Eksiksiz çözüm ya da özet yukarıdaki uzunluk " +
  "sınırına sığmıyorsa bu turda o sınır geçmez; yine de her cümle iş görsün, uzatma ve cevabı bekletme.";

export const TUTOR_FIRST_PROBLEM_LINE =
  "ADIM ADIM ÖĞRET — BU TUR (kesin; 'adım adım çöz, sağlamasını yap, öbür şıkları ele' ve 'ilk cümle tam cevap' " +
  "kurallarından önce gelir): Öğrenci çözülecek yeni bir soru " +
  "getirdi. Çözümü içinden sonuna kadar yap ve sağla, ama bu mesajda sonucu, doğru şıkkı ve sonraki adımları YAZMA. En çok " +
  "2-3 kısa cümleyle yalnız ilk küçük adımı aç (verilenler ya da kurulacak ilk bağıntı) ve öğrencinin bu adımı atmasını " +
  "isteyen TEK, sıcak bir soruyla bitir. Öğrenci 'cevabı göster', 'tamam göster' ya da 'çözümü göster' derse bekletmeden göster.";

export const TUTOR_REVEAL_LINE =
  "CEVAP İSTENDİ — BU TUR (kesin; özel ders ritminin 'kısa adım' ve 'cevabı verme' kurallarından önce gelir): Öğrenci " +
  "cevabı ya da çözümü açıkça görmek istedi. Bekletme ve pazarlık etme. Cevabı istediyse sonucu ilk cümlede ver ve " +
  "takıldığı adımı kısa, açık adımlarla göster; çözümün tamamını istediyse kalan bütün adımları ayrı satırlarda ve nihai " +
  "cevabı ver, sağlamasını yap. Yargılayıcı cümle yok. Sonda anladığını yoklayan tek, sıcak bir soru sor ya da sıradaki " +
  "adımı öner.";

const LADDER_HEAD =
  "CEVAP MERDİVENİ — BU TUR (kesin; 'ilk cümle tam cevap' ve 'doğrusunu ver' kurallarından önce gelir): ";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Adım Adım Öğret'te öğrencinin cevap denemesi: ilk yanlışta ipucu, aynı adımda ikinci takılmada adımı açıkla. */
export function tutorLadderLine(attempt: number, question: string | null): string {
  const target = question
    ? `Öğrencinin mesajı senin son soruna («${clip(question, 160)}») bir cevap denemesi gibi görünüyor`
    : "Öğrenci kendi çözümünü ya da cevabını yazdı";
  if (attempt <= 1) {
    return (
      `${LADDER_HEAD}${target} (1. deneme). Doğruysa: zorluğa orantılı, içten ve çeşitli bir takdirle ` +
      "onayla (zor bir adımsa gerçekten sevin; tek başına kuru 'Doğru.' yok), nedenini en çok bir " +
      "cümleyle söyle ve sıradaki küçük adımı TEK sıcak soruyla aç; konu bittiyse \"> ✅ Akılda kalsın:\" kutusuyla kapat. " +
      "Yanlışsa: yargılamadan karşıla; doğru cevabı ya da doğru şıkkı SÖYLEME ve düzeltmeyi yapma. Olası hatayı adıyla anan " +
      "küçük bir ipucu ver ve yeniden denemesini isteyen tek soruyla bitir. Mesaj aslında bir cevap değilse bu satırı yok say."
    );
  }
  return (
    `${LADDER_HEAD}${target} (aynı adımda ${attempt}. deneme). Doğruysa: zorlandığı adımı başardığı için içtenlikle ve sıcak bir sevinçle onayla, nedenini tek cümleyle söyle ve ` +
    "sıradaki adıma geç. Yanlışsa öğrenci bu adımda takıldı: artık bekletme; hatayı adıyla tek cümleyle göster, bu adımı kısa " +
    "ve açık biçimde açıkla (gerekirse doğru sonucu söyle), sonra sıradaki küçük adımı tek soruyla aç. Suçlama yok. Mesaj " +
    "aslında bir cevap değilse bu satırı yok say."
  );
}

/** Türkçe küçük harf, aksansız; noktalama boşluk olur. */
function fold(text: string): string {
  return String(text ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[’'`"“”«»*_]/g, "")
    .replace(/[.,;:!?…()\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "cevabı / sonucu / çözümü / doğrusunu … göster / söyle / ver / yaz / açıkla" (olumsuz emir hariç). */
const ASK_OBJECT_VERB =
  /\b(?:cevab(?!im)\w*|cevap|sonuc\w*|cozum(?!um)\w*|dogru(?:su|sunu|yu)?|dogru cevab\w*|yanit(?!im)\w*)\s+(goster|soyle|ver|yaz|acikla|anlat)(\w*)/g;
/** Tek başına istek: "tamam göster", "göster artık", "söyle artık". */
const BARE_SHOW = /^(?:(?:tamam|peki|olur|hadi|e|ee|of|evet|yeter|tamam o zaman|o zaman)\s+)*(?:goster|soyle|acikla)(?:\s+(?:artik|bana|lutfen|hadi|o zaman))*$/;
/** "Bulamadım, göster" / "yapamadım söyle": takılma + gösterme isteği. */
const STUCK_SHOW = /\b(?:yapamadim|bulamadim|cozemedim|bilmiyorum|bilemedim|anlamadim|takildim)\b.*\b(goster|soyle|acikla)(\w*)/;

/** Olumsuz emir ("söyleme", "gösterme", "vermeden") ve birinci kişi ("göstereyim", "söyleyelim") istek değildir. */
const negated = (suffix: string | undefined) =>
  /^(?:me|ma|mi|mey|may|y?eyim|y?ayim|y?elim|y?alim)/.test(suffix ?? "");

/**
 * Öğrenci cevabı ya da çözümü açıkça görmek istiyor mu (modelsiz): "cevabı göster", "tamam göster", "çözümü göster",
 * "doğrusunu söyle", "bulamadım, göster" ve "direkt söyle / cevabı ver" (`asksDirectAnswer`). "Cevabı söyleme" ve
 * "ipucu ver" istek değildir.
 */
export function wantsReveal(message: string): boolean {
  const raw = String(message ?? "").trim();
  if (!raw) return false;
  if (asksDirectAnswer(raw)) return true;
  const text = fold(raw);
  if (!text || text.split(" ").length > 16) return false;
  if (BARE_SHOW.test(text)) return true;
  for (const match of text.matchAll(ASK_OBJECT_VERB)) {
    if (!negated(match[2])) return true;
  }
  const stuck = STUCK_SHOW.exec(text);
  return Boolean(stuck && !negated(stuck[2]));
}

/*
  Öğretmen v3 (21 Kasım 2026): "bilmiyorum" ve tahmin turları. Tanıyıcılar modelsiz ve ders bağımsız; yalnız genel Türkçe
  sohbet sözcükleri. Satırlar cevap merdiveninin yerine geçer (seans makinesi seçer).
*/

/** "Bilmiyorum" mesajında anlamı değiştirmeyen dolgu sözcükleri. */
const DONT_KNOW_FILLER = new Set([
  "hocam", "hoca", "ya", "yaa", "valla", "vallahi", "acikcasi", "acikcasi", "maalesef", "malesef", "hic", "tam", "olarak",
  "pek", "su", "an", "simdi", "of", "off", "ah", "hmm", "hm", "ki", "ama", "yani", "cok", "gercekten", "hala", "ben",
  "bunu", "onu", "bu", "o", "soruyu", "cevabi", "cevabini", "sonucu", "dogrusunu", "ne", "oldugunu", "ve", "da", "de",
  "sorry", "uzgunum",
]);

/** Dolgudan arınmış mesajın tamamı bu ifadelerden biri olmalı. */
const DONT_KNOW_CORE =
  "(?:bilmiyorum|bilemiyorum|bilemedim|bilmem|ne bileyim|bileyim|hatirlamiyorum|hatirlayamiyorum|hatirlayamadim|" +
  "unuttum|aklima gelmiyor|aklima gelmedi|fikrim yok|hicbir fikrim yok|emin degilim|bulamadim|yapamadim|cozemedim|" +
  "cikaramadim|anlamadim|anlayamadim|kafam karisti|kafam karisik|karistirdim|i dont know|idk)";
const DONT_KNOW_RE = new RegExp(`^${DONT_KNOW_CORE}(?: ${DONT_KNOW_CORE})?$`);
const DONT_KNOW_MAX_WORDS = 8;

/**
 * Öğrencinin mesajı yalnız "bilmiyorum / hatırlamıyorum / aklıma gelmiyor" mu (dolgu sözcükleri dışında başka içerik
 * yok). "Nereden başlamalıyım bilmiyorum" gibi bir istek ya da "bilmiyorum, göster" (cevap isteği) sayılmaz.
 */
export function saysDontKnow(message: string): boolean {
  const raw = String(message ?? "").trim();
  if (!raw || wantsReveal(raw)) return false;
  const words = fold(raw)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.length > DONT_KNOW_MAX_WORDS) return false;
  const core = words.filter((word) => !DONT_KNOW_FILLER.has(word)).join(" ");
  return Boolean(core) && DONT_KNOW_RE.test(core);
}

/** Emin olmadan verilen cevabın işaretleri ("sanırım", "galiba", "herhalde", "acaba", "… olabilir mi"). */
const HEDGE_RE =
  /\b(?:sanirim|saniyorum|galiba|herhalde|tahminim|tahmin ediyorum|tahminen|acaba|yanilmiyorsam|emin degilim ama|gibi geliyor|sanki|olabilir mi|olmasin|mi yoksa)\b/;
const GUESS_MAX_WORDS = 25;

/** Öğrencinin cevabı emin olmadan verilmiş bir tahmin mi (kısa; "bilmiyorum" ve cevap isteği değil). */
export function hedgedGuess(message: string): boolean {
  const raw = String(message ?? "").trim();
  if (!raw || saysDontKnow(raw) || wantsReveal(raw)) return false;
  const text = fold(raw);
  if (text.split(" ").length > GUESS_MAX_WORDS) return false;
  return HEDGE_RE.test(text);
}

export const DONT_KNOW_LINE =
  "BİLMİYORUM — BU TUR (kesin; 'ilk cümle tam cevap' ve cevap merdiveni kurallarından önce gelir): Öğrenci bilmediğini " +
  "ya da hatırlamadığını söyledi. Bu tamamen normal: asla yargılama ('bunu bilmen gerekirdi', 'daha önce konuşmuştuk' " +
  "yok) ve kalıp moral cümlesi kurma. Tonu hemen yumuşat: o ana özgü tek şefkatli cümleyle rahatlat ve yükü küçült, sonra gereken fikri günlük hayattan doğru bir " +
  "benzetmeyle 2-3 kısa cümlede açıkla (benzetme kavramın gerçek işleyişine ve sınıflandırmasına birebir uysun). Ardından " +
  "bir önceki sorundan daha kolay, daha erişilebilir bir basamakta TEK soru sor. Bir problemin sonucunu ya da doğru " +
  "şıkkı bu mesajda söyleme; öğrenci 'cevabı göster' derse göster.";

const GUESS_HEAD = "TAHMİN — BU TUR (kesin; 'ilk cümle tam cevap' ve cevap merdiveni kurallarından önce gelir): ";

/** Öğrenci emin olmadan bir tahminle cevap verdi: doğruysa içten onay, yanlışsa doğrusunu nazikçe ayırıp öğret. */
export function guessLine(question: string | null): string {
  const target = question
    ? `Öğrenci senin son soruna («${clip(question, 160)}») emin olmadan bir tahminle cevap verdi.`
    : "Öğrenci emin olmadan bir tahmin yürüttü.";
  return (
    `${GUESS_HEAD}${target} Tahminini ciddiye al. Doğruysa: emin olmadan bulduğu için içten ve sıcak bir ` +
    "takdirle onayla (zorluğa orantılı; tek başına kuru 'Doğru.' yok), neden doğru olduğunu bir cümleyle pekiştir ve sıradaki küçük adımı tek soruyla aç. Yanlışsa: " +
    "yargılamadan karşıla; tahminin doğru bir yanı varsa onu tek cümleyle an, yanlış kısmı doğrusundan nazikçe ayır ve " +
    "doğru olanı 2-3 kısa cümleyle öğret (bir hesabın sonucuysa sonucu söyleme: hatanın hangi adımda olduğunu göster ve " +
    "yeniden denemesini iste); sonra anladığını yeni, tek bir soruyla yokla. Mesaj aslında bir cevap değilse bu satırı yok say."
  );
}

/** Bayrak açıkken istekteki seçim → iki moddan biri ve altındaki makine (`base`). Profil yoksa varsayılan. */
export function resolveTeachModeV2(input: { requested: unknown; profile: unknown }): {
  mode: TeachModeV2;
  base: TutorStyle;
} {
  const mode = teachModeFromStyle(input.requested ?? input.profile);
  // Adım Adım Öğret cevabı saklayan makineyle çalışır (ipucu merdiveni, ilk tur); Hızlı Özet doğrudan çözümle.
  return { mode, base: mode === TEACH_MODE_SUMMARY ? "direct_solve" : "hints_first" };
}

export { TEACH_MODE_SUMMARY, TEACH_MODE_TUTOR };
