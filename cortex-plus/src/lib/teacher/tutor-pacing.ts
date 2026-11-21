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
    katılımını isteyen TEK sıcak soruyla biter; tam çözüm tek seferde dökülmez. Doğruda abartısız onay + sıradaki adım,
    yanlışta yargılamadan ipucu; aynı adımda iki-üç kez takılınca ya da açık "cevabı göster" isteğinde o adım açıklanır.
  - "Hızlı Özet": doğrudan, kısa, eksiksiz çözüm ya da özet.

  Bu dosya yalnız kural metinlerini ve modelsiz tanıyıcıları taşır (tek kaynak); turun satırlarını seans makinesi
  (`teacher-v2-session.ts`) seçer. Seviye kalibrasyonu, matematik ve kaynak kuralları aynen geçerli; bunlar onlara
  dokunmaz. Kod cevaba cümle yazmaz; satırlar modele o turun kuralını söyler. Ders ya da konu sözcüğü yok.
*/

/** Robotik açılış ve kapanış kalıpları: iki modda da yasak (ses kılavuzunun kod katmanı ayrıca siler). */
export const ROBOTIC_PHRASE_BAN =
  "Robotik kalıp yok: 'Elbette! İşte…', 'Tabii ki, işte…', 'Harika soru!', 'Aşağıdaki maddelerde özetlenmiştir', " +
  "'Umarım yardımcı olmuştur', 'Başka sorun var mı?' gibi açılış ve kapanışlar yazma; konuya doğrudan, insan gibi gir.";

export const PRIVATE_TUTOR_PACING =
  "ADIM ADIM ÖĞRET MOD (kesin; özel ders ritmi): Bire bir özel ders veren sıcak bir öğretmen gibi konuş.\n" +
  "- Her yanıt en çok 2-3 kısa cümle ve tek odak: tek fikir, tek adım. Duvar gibi uzun metin, madde yığını ve başlık yok.\n" +
  "- Yanıtı öğrencinin katılımını isteyen TEK, sıcak bir soruyla bitir; soru konuya dair olsun, boş bir kapanış sorusu olmasın.\n" +
  "- Çözülecek bir soru ya da problemde tam çözümü tek seferde dökme: çözümü içinden yap ve sağla, öğrenciye yalnız sıradaki küçük adımı aç.\n" +
  "- Doğru cevapta abartısız, kısa bir onay ver ve sıradaki adıma geç. Yanlış cevapta yargılamadan küçük bir ipucu ver; doğrusunu hemen söyleme.\n" +
  "- Öğrenci aynı adımda iki-üç kez takılırsa ya da açıkça 'cevabı göster', 'tamam göster', 'çözümü göster' derse o adımı kısa ve açık biçimde açıkla, sonra devam et.\n" +
  "- Selamlaşmada kısa ve doğal karşılık ver. Kavram sorusunda ('nedir', 'fark ne') tanımı saklama: özünü 2-3 kısa cümleyle ver, sonra anladığını tek soruyla yokla.\n" +
  `- ${ROBOTIC_PHRASE_BAN}`;

export const QUICK_SUMMARY_RULE =
  "HIZLI ÖZET MOD (kesin): Öğrenci hızlı özet seçti. Doğrudan, kısa ve eksiksiz cevap ver; ilk cümle cevabın kendisi. " +
  "Çözülecek bir soruda bütün adımları ayrı satırlarda, her biri tek kısa cümle olacak biçimde yaz, nihai cevabı söyle ve " +
  "sağlamasını yap; adım adım soru sorup bekletme. Kavram sorusunda özü birkaç kısa cümlede ver; gereksiz giriş, tekrar ve " +
  "kapanış yok. Sonda en çok bir kısa kontrol sorusu sorabilirsin; zorunlu değil. " +
  ROBOTIC_PHRASE_BAN;

/** Hızlı Özet'te eksiksiz çözüm tek hamle kelime sınırını aşabilir; tur satırı bunu son söz olarak söyler. */
export const QUICK_SUMMARY_TURN_LINE =
  "HIZLI ÖZET — BU TUR (kesin; tek hamle kelime sınırından önce gelir): Eksiksiz çözüm ya da özet tek hamle kelime " +
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
      `${LADDER_HEAD}${target} (1. deneme). Doğruysa: abartısız, kısa bir onay ver (tek kısa cümle), nedenini en çok bir ` +
      "cümleyle söyle ve sıradaki küçük adımı TEK sıcak soruyla aç; konu bittiyse \"> ✅ Akılda kalsın:\" kutusuyla kapat. " +
      "Yanlışsa: yargılamadan karşıla; doğru cevabı ya da doğru şıkkı SÖYLEME ve düzeltmeyi yapma. Olası hatayı adıyla anan " +
      "küçük bir ipucu ver ve yeniden denemesini isteyen tek soruyla bitir. Mesaj aslında bir cevap değilse bu satırı yok say."
    );
  }
  return (
    `${LADDER_HEAD}${target} (aynı adımda ${attempt}. deneme). Doğruysa: kısa onayla, nedenini tek cümleyle söyle ve ` +
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
