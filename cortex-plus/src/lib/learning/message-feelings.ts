import type { Mood } from "@/lib/learning/session-signals";
import { looksLikeProblem } from "@/lib/learning/tutor-turn";

/**
 * Mesajdaki duygu sinyali (10 Kasım 2026, güven paketi) — saf ve modelsiz, ders bağımsız.
 *
 * Ruh hali altyapısının (`session-signals.ts` `moodPrompt`, `study_session_moods`) mesajdan okunan ucu: öğrenci hapı
 * işaretlemese de mesajında "sıkıldım", "sinir oldum", "panik oldum" diyorsa o turun ruh hali odur. Ayrı bir duygu
 * sistemi kurulmaz; sinyal var olan `Mood` değerine eşlenir ve tura özel tek satır eklenir (`chat-turn-lines.ts`).
 *
 * Yalnız genel Türkçe duygu sözcükleri ve birinci tekil kişi biçimleri aranır ("sinirlendim", "korkuyorum"); ders ya
 * da konu sözcüğü yoktur ve bir dersin terimi olabilecek yalın ad ("sinir", "stres", "korku") tek başına sayılmaz.
 */

export type MessageEmotion = "bored" | "frustrated" | "anxious";

/** Türkçe küçük harf, aksansız; noktalama boşluk olur. Soru işareti istenirse korunur. */
function fold(text: string, keepQuestionMark = false): string {
  const folded = (text ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[’'`]/g, "")
    .replace(/[.,;:!…()"“”«»]+/g, " ");
  return (keepQuestionMark ? folded : folded.replace(/\?/g, " ")).replace(/\s+/g, " ").trim();
}

const ANXIOUS: RegExp[] = [
  /\bpanik(?:ledim|liyorum|teyim| oldum| oluyorum| yaptim| yapiyorum| halindeyim| atak)/,
  /\bpanigim\b/,
  /\bkork(?:uyorum|tum|maya basladim)\b/,
  /\bkaygi(?:liyim|landim|laniyorum)\b/,
  /\bendise(?:liyim|lendim|leniyorum)\b/,
  /\bstres(?:liyim|lendim|leniyorum| oldum| oluyorum| yaptim| yapiyorum| altindayim)\b/,
  /\bgergin(?:im|lestim)\b/,
  /\bgeril(?:dim|iyorum)\b/,
  /\btelas(?:liyim|landim|a kapildim)\b/,
  /\b(?:yetis(?:e)?meyecek|yetistiremeyecegim|yetismiyor|yapamayacagim|basaramayacagim)\b/,
  /\bbunal(?:dim|iyorum)\b/,
  /\bagla(?:yacagim|mak uzereyim)\b|\bagliyorum\b/,
];

const FRUSTRATED: RegExp[] = [
  /\bsinir(?: oldum| oluyorum|lendim|leniyorum|liyim| bozucu)\b/,
  /\bsinirim (?:bozuldu|bozuluyor|tepeme)/,
  /\b(?:ofke(?:liyim|lendim|leniyorum)|kizginim|cok kizdim)\b/,
  /\bcildir(?:acagim|iyorum|dim|tacak)\b/,
  /\bdelir(?:ecegim|iyorum|dim|tecek)\b/,
  /\bkafayi yi(?:yecegim|yorum|dim)\b/,
  /\b(?:biktim|usandim|gina geldi|yeter artik|illallah)\b/,
  /\bnefret ediyorum\b/,
  /\bgicik (?:oldum|oluyorum)\b/,
  /\bsabrim (?:kalmadi|tasti|tukendi)\b/,
  /\bcileden cik/,
];

const BORED: RegExp[] = [
  /\bsikil(?:dim|iyorum|maya basladim)\b/,
  /\bcok sikici\b|\bsikici (?:geldi|geliyor|oldu)\b/,
  /\b(?:cok|fazla|asiri|bu kadar|bana) (?:kolay|basit)(?! (?:bir|soru|ornek|anlat|acikla|soyle|ozetle|sekilde|dille|sor))\b/,
  /\b(?:kolay|basit) gel(?:di|iyor)\b/,
  /\b(?:bunlar|bu|sorular|hepsi) (?:cok )?(?:kolay|basit)(?: ya| ki| yaa)?$/,
  /\b(?:zaten|bunlari|bunu|hepsini) (?:zaten )?biliyorum\b/,
  /\bcocuk oyuncagi\b/,
];

/**
 * Mesajdaki duygu: kaygı/panik, sinir/öfke ya da sıkılma/kolay bulma; yoksa null. Birden çok varsa en çok destek
 * gerektiren önce (kaygı > sinir > sıkılma).
 */
export function detectMessageEmotion(message: string): MessageEmotion | null {
  const text = fold(message);
  if (!text) return null;
  if (ANXIOUS.some((pattern) => pattern.test(text))) return "anxious";
  if (FRUSTRATED.some((pattern) => pattern.test(text))) return "frustrated";
  if (BORED.some((pattern) => pattern.test(text))) return "bored";
  return null;
}

/**
 * Mesaj duygusunun ruh hali karşılığı: tur boyunca `moodPrompt` bu değerle yazılır. Sıkılan öğrenci "hazırım"
 * tonunu (yüksek tempo, zorlayıcı soru), sinirli ve kaygılı öğrenci "stresli" tonunu (sakinleştir, tek küçük adım) alır.
 */
export function emotionMood(emotion: MessageEmotion): Mood {
  return emotion === "bored" ? "ready" : "stressed";
}

const LESSON_REQUEST =
  /\b(?:nedir|nelerdir|ne demek|nasil|neden|nicin|hangi\w*|kac\w*|coz\w*|hesapla\w*|anlat\w*|acikla\w*|goster\w*|ozetle\w*|farki ne\w*|ornek ver\w*)\b/;

/** Duyguya dair soru ("ne yapmalıyım?", "nasıl sakinleşirim?") ders sorusu değildir. */
const FEELING_QUESTION = /\b(?:ne yapmaliyim|ne yapacagim|ne yapayim|ne yapsam|nasil (?:sakin|rahat|basa cik|toparlan|motive|hisse)\w*)/g;

/**
 * Mesaj duygu ifadesinin yanında bir ders sorusu da taşıyor mu: duygu sözcükleri çıkarıldıktan sonra geriye
 * çözülecek bir problem ya da soru/istek sözcüğü kalıyorsa evet.
 */
export function carriesLessonQuestion(message: string): boolean {
  if (looksLikeProblem(message)) return true;
  let text = fold(message);
  for (const pattern of [...ANXIOUS, ...FRUSTRATED, ...BORED]) {
    text = text.replace(new RegExp(pattern.source, "g"), " ");
  }
  text = text.replace(FEELING_QUESTION, " ").replace(/\s+/g, " ").trim();
  if (text.split(" ").filter((word) => word.length > 1).length < 2) return false;
  return LESSON_REQUEST.test(text);
}

const GENERAL_FEELING: RegExp[] = [
  /\bhissed(?:iyorum|emiyorum)\b|\bhissett(?:im|igim)\b|\bhislerim\b|\bduygularim\b/,
  /\b(?:moralim|modum|keyfim|motivasyonum|hevesim)\b/,
  /\b(?:kotuyum|iyi degilim|mutsuzum|uzgunum|yorgunum|yoruldum|bitkinim|tukendim|usendim)\b/,
  /\bicim (?:sikil|daral|karar)/,
  /\b(?:calismak|devam etmek|ders calismak) istemiyorum\b/,
  /\bicimden gelmiyor\b/,
];

/** Mesaj genel bir duygu / hâl ifadesi taşıyor mu ("aynı hissediyorum", "moralim bozuk", "sıkıldım"). */
export function generalFeelingStatement(message: string): boolean {
  const text = fold(message);
  if (!text) return false;
  return detectMessageEmotion(message) !== null || GENERAL_FEELING.some((pattern) => pattern.test(text));
}

/**
 * Açık kriz ifadesi: kendine zarar verme, intihar ya da akut tehlike — birinci tekil kişiyle. Güvenlik sorusunu
 * yalnız bu ifadeler haklı çıkarır; "aynı hissediyorum", "çok kötüyüm" gibi genel cümleler çıkarmaz. Üçüncü kişili
 * ders cümlesi ("romanda kahraman intihar ediyor") kriz değildir. Liste koruyucu yönde geniştir: yanlış alarm bir
 * destek cümlesidir, kaçırılan kriz değil.
 */
const CRISIS: RegExp[] = [
  /\bkendime zarar\b/,
  /\bkendimi (?:oldur|as(?:mak|acag|icam|sam)|kes(?:mek|ecegim|icem|iyorum|tim)|yok et|zehirle)/,
  /\bkendimi (?:\S+ )?(?:camdan|balkondan|kopruden|catidan|asagi(?:ya)?) at/,
  /\b(?:camdan|balkondan|kopruden|catidan) atla(?:yacagim|mak ist|yasim|sam)/,
  /\bintihar(?:i| etmeyi)? (?:dusunuyorum|dusundum|et(?:mek ist|sem|icem)|edecegim|edesim|edicem)/,
  /\bintihara (?:meyilliyim|egilimim|kalkis(?:tim|acagim)|tesebbus ett?im)/,
  /\bcanima kiy/,
  /\bolmek ist(?:iyorum|erdim|edim|iyom)\b/,
  /\bolmeyi (?:dusun|ist)/,
  /\bkeske ol(?:sem|seydim|mus olsam)\b/,
  /\bolsem (?:daha iyi|de kurtul)/,
  /\bolup kurtul(?:sam|mak ist)/,
  /\byasamak istemiyorum\b/,
  /\byasamaktan (?:biktim|yoruldum|vazgec)/,
  /\bhayatima son ver/,
  /\bbileklerimi kes/,
  /\b(?:hayatim|canim) tehlikede\b|\btehlikedeyim\b/,
  /\b(?:taciz|istismar|siddet|tecavuz)e? (?:ediliyorum|ugruyorum|ugradim|goruyorum|gordum)\b/,
  /\bbeni (?:dovuyor|dovduler|dovdu|oldurecek|oldurmekle tehdit)/,
];

/** Mesajda açık kendine zarar verme / intihar / akut tehlike ifadesi var mı. */
export function explicitCrisisSignal(message: string): boolean {
  const text = fold(message);
  return Boolean(text) && CRISIS.some((pattern) => pattern.test(text));
}
