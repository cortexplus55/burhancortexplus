import { isAnswerTo } from "@/lib/ai/teacher-v2-session";
import { matchChatMaterial, type ChatMaterialIndex, type ChatPrepCandidate } from "@/lib/ai/chat-material-link";
import { withoutOutcomeCode } from "@/lib/learning/path-labels";
import { looksLikeQuestion } from "@/lib/learning/tutor-answer";
import { followUpKind, looksLikeProblem, type TurnHistoryItem } from "@/lib/learning/tutor-turn";
import { moreCommandFromMessage } from "@/lib/teacher/more-commands";
import { saysDontKnow } from "@/lib/teacher/tutor-pacing";

/*
  Aktif hazırlık hafızası (öğretmen v3, teacher.v2 ana sohbeti, 21 Kasım 2026, ürün sahibinin istemi). Öğrenci ana
  ekranda bir hazırlık seçtiyse (sunucuda sahipliği doğrulanmış `contextPrepId`) öğretmen o hazırlığı bilir:

  - örneklerini o alandan seçer (bilgi satırı);
  - öğrenci hazırlığın konularının dışında bir konu sorarsa önce yardım eder, o konuda bir tur geçtikten sonra BİR KEZ
    nazikçe kendi sınav konularına dönmeyi önerir; öğrenci geri çevirirse saygıyla devam eder ve o konuşmada yeniden
    önermez.

  Durum konuşma geçmişinden okunur (sunucu durumsuzdur): öneri anı geçmişin üzerinden aynı kuralla yeniden hesaplanır
  (ilk tetiklendiği tur öneri turudur; ondan sonra bir daha öneri yok). Konu eşleştirmesi öğrencinin kendi kayıtlarındaki
  hazırlık adı, ders türü ve konu başlıklarıyla (`matchChatMaterial`); kod hiçbir ders ya da konu adı bilmez. Konunun
  gerçekten dışarıda olup olmadığına son kararı model verir: satır "konu aslında bu hazırlıktansa yok say" der.

  "Genel" bağlamda (seçili hazırlık yok) hiçbiri çalışmaz: o modda hazırlık adı anılmaz (tek hamle kuralı).
  Saf ve modelsiz; veritabanı yok.
*/

export type ActivePrep = {
  id: string;
  title: string;
  daysLeft: number | null;
  /** Konu başlıkları (kazanım kodsuz, sırayla). */
  topics: string[];
  /** Eşleştiricinin okuduğu aday (ham başlıklarla). */
  candidate: ChatPrepCandidate;
};

const TOPIC_LIST_MAX = 8;

/** İsteme giden ad: kazanım kodu, köşeli/açılı parantez ve satır sonu yok; kısa. */
export function promptLabel(text: unknown, max = 60): string {
  const clean = withoutOutcomeCode(String(text ?? ""))
    .replace(/[«»[\]\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Öğrencinin kendi listesinde bulunan seçili hazırlık; yoksa null (istemciden gelen kimliğe güvenilmez). */
export function activePrepFromIndex(index: ChatMaterialIndex | null, prepId: string | null | undefined): ActivePrep | null {
  if (!index || !prepId) return null;
  const candidate = index.preps.find((prep) => prep.id === prepId);
  if (!candidate) return null;
  const title = promptLabel(candidate.title, 80);
  if (!title) return null;
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const topic of candidate.topics) {
    const label = promptLabel(topic.label, 50);
    const key = label.toLocaleLowerCase("tr");
    if (!label || seen.has(key)) continue;
    seen.add(key);
    topics.push(label);
  }
  return { id: candidate.id, title, daysLeft: candidate.daysLeft, topics, candidate };
}

/** Mesaj aktif hazırlığın adını, ders türünü ya da bir konu başlığını anıyor mu. */
export function mentionsActivePrep(text: string, prep: ActivePrep): boolean {
  return matchChatMaterial(String(text ?? ""), { preps: [prep.candidate], documents: [] }).reason === "named";
}

const fold = (text: string) =>
  String(text ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Konu anlatımı / açıklama isteği fiilleri (genel Türkçe). */
const ASK_VERB = /\b(?:anlat\w*|acikla\w*|ogret\w*|ozetle\w*|nedir|nelerdir|nasil|neden|niye|nicin|ne demek\w*|farki\w*)\b/;

/** Konu sayılmayan genel sohbet sözcükleri: beş harfli başları (selam, teşekkür, çalışma isteği, soru sözcükleri …). */
const GENERIC_STEMS = new Set([
  "merha", "selam", "nasil", "naber", "iyiyi", "tesek", "sagol", "gunay", "kolay", "calis", "bugun", "hocam", "lutfe",
  "simdi", "sonra", "biraz", "neden", "nedir", "neler", "anlat", "acikl", "ogret", "ozetl", "yardi", "demek", "farki",
  "nicin", "tamam", "kadar", "konus", "konuy", "konud", "konul", "sorul", "sorus", "soruy", "sorud", "sorun", "ornek",
]);
/** Dört harfli genel sözcükler (birebir). */
const GENERIC_SHORT = new Set(["daha", "bunu", "bana", "sana", "beni", "sunu", "soru", "konu", "peki", "gibi", "icin", "olan", "niye", "nasl"]);

/** Mesajda konuyu taşıyan en az bir içerik sözcüğü var mı. */
function hasContentWord(text: string): boolean {
  return fold(text)
    .split(" ")
    .some((word) => {
      if (word.length < 4 || /^\d+$/.test(word)) return false;
      return word.length === 4 ? !GENERIC_SHORT.has(word) : !GENERIC_STEMS.has(word.slice(0, 5));
    });
}

/**
 * Bir konu sorusu ya da anlatım isteği mi (modelsiz): soru, problem ya da anlat/açıkla isteği ve en az bir içerik
 * sözcüğü. Takip mesajı ("devam et"), "Daha fazla" komutu ve "bilmiyorum" sayılmaz.
 */
export function isSubjectTurn(text: string): boolean {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  if (followUpKind(raw) || moreCommandFromMessage(raw) || saysDontKnow(raw)) return false;
  if (!(looksLikeQuestion(raw) || looksLikeProblem(raw) || ASK_VERB.test(fold(raw)))) return false;
  return hasContentWord(raw);
}

type TurnKind = "prep" | "subject" | "neutral";
type UserTurn = { text: string; prevTutor: string };

const textOf = (content: unknown) => (typeof content === "string" ? content : "");

function userTurns(history: readonly TurnHistoryItem[], message: string): UserTurn[] {
  const turns: UserTurn[] = [];
  let lastTutor = "";
  for (const item of history) {
    if (item.role === "assistant") lastTutor = textOf(item.content);
    else if (item.role === "user") turns.push({ text: textOf(item.content), prevTutor: lastTutor });
  }
  turns.push({ text: message, prevTutor: lastTutor });
  return turns;
}

function kindOf(turn: UserTurn, prep: ActivePrep): TurnKind {
  if (mentionsActivePrep(turn.text, prep)) return "prep";
  if (turn.prevTutor && isAnswerTo(turn.text, turn.prevTutor)) return "neutral";
  return isSubjectTurn(turn.text) ? "subject" : "neutral";
}

/** Öneri bu turda yapılabilir mi: konuda en az bir tur geçmiş (konu sorusundan sonra öğretmen bir kez cevaplamış). */
function inviteDue(kinds: readonly TurnKind[], turns: readonly UserTurn[], at: number): boolean {
  const text = turns[at]!.text;
  if (moreCommandFromMessage(text) || saysDontKnow(text)) return false;
  let earliest = -1;
  for (let index = at; index >= 0; index -= 1) {
    const kind = kinds[index]!;
    if (kind === "prep") break;
    if (kind === "subject") earliest = index;
  }
  return earliest >= 0 && at - earliest >= 1;
}

export type PrepInviteState =
  | { kind: "none" }
  /** Bu tur öneri turu. */
  | { kind: "invite" }
  /** Öneri bir önceki turdaydı; öğrencinin bu mesajı ona karşılık. */
  | { kind: "reply"; answer: "declined" | "accepted" | "other" }
  /** Öneri bu konuşmada daha önce yapıldı. */
  | { kind: "done" };

const DECLINE =
  /\b(?:yok|hayir|istemiyorum|istemem|simdi degil|sonra bakariz|gerek yok|kalsin|olmaz|bos ver|bosver|buradan devam|bundan devam|buna devam|bununla devam|bu konuya devam|bu konudan devam|boyle devam|devam edelim|burada kalalim|once bunu bitirelim)\b/;
const ACCEPT_SWITCH = /\b(?:gecelim|donelim|gecebiliriz|donebiliriz|baslayalim|gecmek istiyorum|donmek istiyorum)\b/;
const ACCEPT_SHORT = /^(?:olur|isterim|tamam olur|evet olur|olur tabii|olur tabi|hadi|tabii|tabi)$/;

/** Öneriye verilen karşılık (modelsiz): geri çevirme önce sınanır. */
export function inviteAnswer(message: string, prep: ActivePrep): "declined" | "accepted" | "other" {
  const text = fold(message);
  if (!text) return "other";
  if (DECLINE.test(text)) return "declined";
  if (mentionsActivePrep(message, prep) || ACCEPT_SWITCH.test(text) || ACCEPT_SHORT.test(text)) return "accepted";
  return "other";
}

/**
 * Aktif hazırlık önerisinin bu turdaki durumu. Öneri anı geçmiş üzerinden yeniden hesaplanır: kural ilk kez hangi
 * turda tuttuysa öneri o turdadır; sonraki turlarda bir daha öneri yok.
 */
export function readPrepInvite(history: readonly TurnHistoryItem[], message: string, prep: ActivePrep): PrepInviteState {
  const turns = userTurns(history, message);
  const kinds = turns.map((turn) => kindOf(turn, prep));
  const current = turns.length - 1;
  let first = -1;
  for (let index = 0; index < turns.length; index += 1) {
    if (inviteDue(kinds, turns, index)) {
      first = index;
      break;
    }
  }
  if (first < 0) return { kind: "none" };
  if (first === current) return { kind: "invite" };
  if (first === current - 1) return { kind: "reply", answer: inviteAnswer(message, prep) };
  return { kind: "done" };
}

function prepHead(prep: ActivePrep): string {
  const days =
    prep.daysLeft == null || prep.daysLeft < 0 ? "" : prep.daysLeft === 0 ? "sınav bugün" : `sınava ${prep.daysLeft} gün`;
  const topics = prep.topics.slice(0, TOPIC_LIST_MAX).join(", ");
  const extra = [days, topics ? `konuları: ${topics}${prep.topics.length > TOPIC_LIST_MAX ? ", …" : ""}` : ""].filter(Boolean);
  return `«${prep.title}»${extra.length ? ` (${extra.join("; ")})` : ""}`;
}

/** Her turda (bilgi): öğrencinin çalıştığı hazırlık ve örneklerin alanı. */
export function activePrepLine(prep: ActivePrep): string {
  return (
    `AKTİF HAZIRLIK (bilgi): Öğrenci şu an ${prepHead(prep)} hazırlığını çalışıyor. Örnek gerektiğinde mümkünse bu ` +
    "alandan, doğru ve gerçek durumlar seç; uydurma veri yok."
  );
}

export function prepInviteLine(prep: ActivePrep, suggestTopic: string | null): string {
  const suggestion = suggestTopic ? `; önerebileceğin konu: «${promptLabel(suggestTopic, 50)}»` : "";
  return (
    "AKTİF HAZIRLIK DAVETİ — BU TUR (kesin; bu konuşmada yalnız bir kez): Son mesajlarda öğrencinin " +
    `${prepHead(prep)} hazırlığının konularının dışında bir konu konuşuyorsunuz gibi görünüyor. Önce bu turun sorusuna ` +
    "tam ve gönülden yardım et. Konu gerçekten bu hazırlığın dışındaysa yanıtının sonuna doğru (son sorundan önce) tek " +
    `kısa ve sıcak bir cümleyle, ısrar etmeden, bunu bitirince istersen «${prep.title}» konularına dönebileceğinizi söyle` +
    `${suggestion}. Bu cümle soru olmasın: yanıtın tek sorusu yine konuya dair olsun. Öneriyi bu konuşmada tekrar etme. ` +
    "Konu aslında bu hazırlığın konularındansa bu satırı yok say."
  );
}

export const PREP_INVITE_DECLINED_LINE =
  "AKTİF HAZIRLIK — BU TUR (kesin): Öğrenci kendi sınav konularına dönme önerini geri çevirdi ya da bu konuyla devam " +
  "etmek istedi. Saygıyla bu konudan devam et; öneriyi tekrar etme, sitem ya da ısrar yok ve bu konuşmada sınav " +
  "konularına yeniden davet etme.";

export function prepInviteAcceptedLine(prep: ActivePrep, suggestTopic: string | null): string {
  const start = suggestTopic
    ? `önerdiğin «${promptLabel(suggestTopic, 50)}» konusundan (öğrenci başka bir konu söylediyse ondan)`
    : "öğrencinin söylediği ya da en uygun konudan";
  return (
    `AKTİF HAZIRLIK — BU TUR (kesin): Öğrenci «${prep.title}» konularına dönme önerini kabul etti. Tek kısa cümleyle ` +
    `geçişi yap ve ${start} başla: ilk parçayı kısa anlat ve tek soruyla bitir.`
  );
}

/** Aktif hazırlığın bu turdaki satırları (bilgi + öneri durumu). */
export function activePrepTurnLines(input: {
  prep: ActivePrep | null;
  history: readonly TurnHistoryItem[];
  message: string;
  suggestTopic: string | null;
}): { lines: string[]; invite: PrepInviteState["kind"] } {
  const { prep } = input;
  if (!prep) return { lines: [], invite: "none" };
  const lines = [activePrepLine(prep)];
  const state = readPrepInvite(input.history, input.message, prep);
  if (state.kind === "invite") lines.push(prepInviteLine(prep, input.suggestTopic));
  else if (state.kind === "reply" && state.answer === "declined") lines.push(PREP_INVITE_DECLINED_LINE);
  else if (state.kind === "reply" && state.answer === "accepted") lines.push(prepInviteAcceptedLine(prep, input.suggestTopic));
  return { lines, invite: state.kind };
}
