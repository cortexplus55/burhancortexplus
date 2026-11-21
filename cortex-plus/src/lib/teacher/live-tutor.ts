import { ONE_MOVE_HEAD, ONE_MOVE_LENGTH_RULE, ONE_MOVE_MARKUP } from "@/lib/ai/teacher-v2";
import { isAnswerTo, repeatsAskedQuestion, tutorQuestions } from "@/lib/ai/teacher-v2-session";
import { SIMPLIFY_LINE, simplifyLine } from "@/lib/ai/simplify-request";
import { studentOutputText } from "@/lib/learning/student-output-firewall";
import { looksLikeQuestion } from "@/lib/learning/tutor-answer";
import type { TurnHistoryItem } from "@/lib/learning/tutor-turn";
import { hedgedGuess } from "@/lib/teacher/tutor-pacing";
import { activePrepTurnLines, promptLabel, type ActivePrep, type PrepInviteState } from "@/lib/teacher/active-prep";
import { cleanFollowUp, FOLLOW_UP_COUNT, FOLLOW_UP_MAX_CHARS, normalizeFollowUps } from "@/lib/teacher/follow-ups";
import { moreCommandFromMessage, type MoreCommandId } from "@/lib/teacher/more-commands";
import { QUICK_CHECK_MARK } from "@/lib/teacher/quick-check";

/*
  ÖĞRETMEN v3 · CANLI ÖZEL DERS HOCASI (teacher.v2 ana sohbeti, 21 Kasım 2026, ürün sahibinin istemi). Kurallar tek
  kaynakta; sohbet ucu yalnız bayrak açıkken ve ana sohbette (hazırlık sohbeti değil) okur. Bayrak kapalıyken hiçbiri
  isteme girmez.

  - `LIVE_TUTOR_MARKUP`: tek hamle dilinin ana sohbetteki hâli. Değişen tek şey uzunluk satırı ("2-3 kısa paragraf"),
    hoca kimliği ve takip soruları kuralı; işaretler, kutu sınırı, iç sistem dili yasağı ve uzlaşım kuralı aynen.
  - Tura özel satırlar: ilk temasta adla hitap, karşılama cevabı, "Daha fazla" menüsünün altı komutu, sürmekte olan test
    ve aktif hazırlık (`active-prep.ts`).
  - Takip soruları: model yanıtın sonuna `[[sorular:…]]` yazar; sunucu ayırır, temizler ve kayıttan önce tek işaret
    olarak sona koyar (`follow-ups.ts`). Model yazmadıysa soru uydurulmaz.

  Saf ve modelsiz; veritabanı yok. Kod cevaba cümle yazmaz; satırlar modele o turun kuralını söyler. Ders ya da konu
  sözcüğü yok.
*/

export const LIVE_TUTOR_HEAD = "CANLI ÖZEL DERS BİÇİMİ (kesin; bu kural öbür biçim kurallarından önce gelir):\n";

export const LIVE_TUTOR_LENGTH_RULE =
  "- Anlatım kısa, net ve örnekli: 2-3 kısa paragraf (paragraf başına 2-3 kısa cümle, aralarında boş satır), toplam en " +
  "çok 170 kelime; kısa bir karşılık ya da tek bir adım daha kısa kalır. Anahtar kavram **koyu**; duvar gibi metin yok. " +
  "Bir şey öğret ve tek bir şey sor; ikisini birden uzatma.\n";

export const LIVE_TUTOR_IDENTITY =
  "- Sen öğrencinin canlı özel ders hocasısın: sabırlı, sıcak ve net; konuya doğrudan, insan gibi girersin. Öğrencinin " +
  "adını yalnız sana söylendiği turda (ilk temas) kullan; sonraki yanıtlarda her seferinde ad kullanma.\n";

export const FOLLOW_UP_RULE =
  "- TAKİP SORULARI: Bir konuyu anlattığın ya da bir adımı açtığın yanıtın EN SONUNA, kendi satırında, tam şu biçimde " +
  "tek satır ekle: [[sorular:Soru bir?|Soru iki?|Soru üç?]] — öğrencinin ağzından, tam o an anlattığın konunun doğal " +
  `devamı olan ${FOLLOW_UP_COUNT} kısa merak sorusu (her biri en çok ${FOLLOW_UP_MAX_CHARS} karakter ve soru işaretiyle ` +
  "biter; içinde '|' ya da köşeli parantez yok). Sorular cevabı ele vermez, yanıtındaki kendi sorunla aynı değildir, " +
  "birbirini tekrar etmez. Bu satır 'mesajı tek soruyla bitir' kuralının dışındadır: yanıtın kendi sorusu metnin son " +
  "cümlesidir, bu satır ondan sonra gelir. Ekran onu düğme olarak gösterir; metinde bu satırdan söz etme. Selamlaşmada, " +
  "güvenlik ya da yalnız duygu yanıtında, test sorusu sorduğun turda ve konu anlatmayan kısa yanıtlarda bu satırı yazma.";

/**
 * Formül yazımı (21 Kasım 2026, ürün sahibi: "çirkin düz √20 yerine üstü çizgili kök"). Ekran `$…$` içini KaTeX ile
 * çizer; ses motoru aynı TeX'i Türkçe okur. Model yine de düz simge yazarsa ekranın ön işleyicisi çevirir
 * (`unicode-math-to-tex.ts`).
 */
export const FORMULA_LATEX_RULE =
  "- FORMÜL YAZIMI (kesin): Kök, kesir, üs, alt simge, Yunan harfi, vektör, birimli büyüklük ve kimyasal formül her zaman " +
  "LaTeX ile ve dolar işaretleri arasında yazılır: satır içinde $\\sqrt{20}$, $\\sqrt{45} = \\sqrt{9} \\times \\sqrt{5}$, " +
  "$\\frac{a}{b}$, $x^2$, $\\Delta P = \\rho g h$, $9{,}8\\ \\mathrm{m/s^2}$, $\\mathrm{H_2O}$, $\\mathrm{Na^+}$; tek " +
  "başına önemli bir formül ayrı satırda $$…$$. Düz √, ², ×, ₂ simgesi yazma. Formül ==…== ya da **…** içinde " +
  "olabilir; formülün içine başka işaret koyma.";

/** Tek hamle dilinin başlığı ve uzunluk satırı değişir; geri kalanı aynen; sonda formül ve takip soruları kuralları. */
export const LIVE_TUTOR_MARKUP =
  ONE_MOVE_MARKUP.replace(ONE_MOVE_HEAD, LIVE_TUTOR_HEAD).replace(ONE_MOVE_LENGTH_RULE, LIVE_TUTOR_LENGTH_RULE + LIVE_TUTOR_IDENTITY) +
  `\n${FORMULA_LATEX_RULE}\n${FOLLOW_UP_RULE}`;

/* ---------------- Ad ve ilk temas ---------------- */

const NAME_MAX = 24;

/**
 * Profil adının ilk sözcüğü, baş harfi Türkçe kuralla büyük (gerisine dokunulmaz). E-posta, rakam ya da işaret taşıyan
 * değer ad sayılmaz; yoksa null (öğretmen adsız konuşur).
 */
export function tutorFirstName(fullName: unknown): string | null {
  const first = String(fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || first.includes("@")) return null;
  if (/[^\p{L}'’-]/u.test(first)) return null;
  if ([...first].length < 2 || [...first].length > NAME_MAX) return null;
  return first.charAt(0).toLocaleUpperCase("tr-TR") + first.slice(1);
}

/** İlk temas: konuşmanın ilk öğretmen yanıtı (geçmişte öğretmen mesajı yok) ya da karşılama cevabı. */
export function isFirstContact(history: readonly TurnHistoryItem[], welcomeAnswer: boolean): boolean {
  return welcomeAnswer || !history.some((item) => item.role === "assistant");
}

export function firstContactLine(name: string): string {
  return (
    "İLK TEMAS — BU TUR: Bu, öğrenciyle bu sohbetteki ilk yanıtın. İlk cümlende öğrenciye adıyla " +
    `(«${name}») doğal ve sıcak bir şekilde bir kez hitap et; adı yanıt içinde tekrar etme. Sonraki yanıtlarda her ` +
    "seferinde adını kullanma."
  );
}

/* ---------------- Karşılama cevabı ---------------- */

export const WELCOME_ANSWER_LINE =
  "KARŞILAMA CEVABI — BU TUR (kesin; öbür tur satırlarından önce gelir): Öğrenci az önce nasıl öğrendiğini, nerede " +
  "zorlandığını ya da hocasının neyi vurguladığını anlattı. Kısa ve sıcak bir teşekkürle başla ve bunu aklında tutacağını " +
  "tek cümleyle söyle (verdiğin söz: anlatımını buna göre ayarlamak; kayıt, not ya da sistem dili yok). Anlattıklarına " +
  "göre nasıl ilerleyeceğinizi 1-2 kısa cümleyle öner (ör. kısa adımlar, benzetmeler, hocasının vurguladığı yerden " +
  "başlamak) ve nereden başlamak istediğini soran tek soruyla bitir. Bu mesajda konu anlatma; kutu, liste ve takip " +
  "soruları satırı yok. Öğrenci kendinden bir şey anlatmadıysa (yalnız selam ya da kısa cevap) kısa karşıla ve neyi " +
  "çalışmak istediğini sor.";

/* ---------------- "Daha fazla" komutları ---------------- */

const NO_TOPIC = "Konuşmada belli bir konu yoksa önce hangi konuyu istediğini tek soruyla sor.";

export const PRIVATE_LESSON_LINE =
  "ÖZEL DERS — BU TUR (kesin): Öğrenci konuşmadaki konuda kendisine özel ders vermeni istedi. Konuyu küçük parçalara " +
  "böl; bu mesajda yalnız ilk parçayı 2-3 kısa paragrafta, somut bir örnekle anlat ve anladığını yoklayan tek, sıcak bir " +
  "soruyla bitir. Sonraki parçalara öğrencinin cevabından sonra, birer birer geç. " +
  `${NO_TOPIC} (Aktif hazırlığı söylendiyse oradan bir konu öner.)`;

export const EXPLAIN_SIMPLE_LINE =
  "ÇOK BASİT ANLAT — BU TUR (kesin; SADELEŞTİR kuralıyla birlikte): Öğrenci konuşmadaki son konuyu 5 yaşındaki bir " +
  "çocuğa anlatır gibi istedi. Bir çocuğun dünyasından tek bir somut benzetme seç (oyuncak, oyun, mutfak, park gibi; " +
  "benzetme kavramın gerçek işleyişine uysun); terim kullanırsan hemen ardından çocuk diliyle açıkla. " +
  NO_TOPIC;

export const KEY_CONCEPTS_LINE =
  "TEMEL KAVRAMLAR — BU TUR (kesin): Konuşmadaki konunun olmazsa olmaz 3-5 temel kavramını yaz: her kavram ayrı " +
  "satırda, adı **koyu**, ardından tek kısa cümlelik anlamı; sınavda en kritik olanın çekirdeğini ==…== ile işaretle (en " +
  "çok 1). Bu turda paragraf sınırı yerine bu satırlar geçer. Sonda hangisini derinleştirmek istediğini tek soruyla sor. " +
  NO_TOPIC;

export const CONNECT_CONCEPTS_LINE =
  "KAVRAM BAĞLANTILARI — BU TUR (kesin): Konuşmadaki konunun ana kavramlarını birbirine bağla: neden-sonuç ya da " +
  "parça-bütün ilişkisini kısa bir zincirle göster (her halka ayrı satırda, 'A → B: çünkü …' biçiminde, en çok 5 halka); " +
  "en önemli bağlantıyı ==…== ile işaretle ve öğrencinin bir bağlantıyı kendi cümlesiyle kurmasını isteyen tek soruyla " +
  `bitir. ${NO_TOPIC}`;

export type TutorGaps = {
  /** Kayıttaki zayıf ya da "bildiğini sanıp yanıldığı" konular (adlar). */
  topics: string[];
  /** Çözülmemiş son yanlışlar. */
  mistakes: { question: string; topic: string | null }[];
};

/** "Eksik olduğum noktaları bul": kayıt varsa yalnız onlardan; yoksa dürüstçe teşhis sorusuyla başla. */
export function findGapsLine(gaps: TutorGaps | null): string {
  const topics = (gaps?.topics ?? []).map((topic) => promptLabel(topic, 50)).filter(Boolean).slice(0, 3);
  const mistakes = (gaps?.mistakes ?? [])
    .map((row) => {
      const question = promptLabel(row.question, 90);
      const topic = promptLabel(row.topic, 50);
      return question ? `«${question}»${topic ? ` (${topic})` : ""}` : "";
    })
    .filter(Boolean)
    .slice(0, 3);
  if (!topics.length && !mistakes.length) {
    return (
      "EKSİK NOKTALAR — BU TUR (kesin): Öğrenci eksiklerini bulmanı istedi ama çalışma kayıtlarında henüz zayıf konu ya " +
      "da çözülmemiş yanlış yok. Bunu dürüstçe tek cümleyle söyle (eksik uydurma) ve eksiği birlikte bulmak için " +
      "konuşmadaki konudan (yoksa aktif hazırlığından) TEK teşhis sorusuyla başla; cevabını bekle. Sonraki turlarda " +
      "cevaplarına göre birer birer teşhis sorusu sor ve gördüğün eksiği adıyla söyle."
    );
  }
  const parts = [
    topics.length ? `zayıf konular: ${topics.join(", ")}` : "",
    mistakes.length ? `çözülmemiş yanlışları: ${mistakes.join("; ")}` : "",
  ].filter(Boolean);
  return (
    `EKSİK NOKTALAR — BU TUR (kesin): Öğrenci eksiklerini bulmanı istedi. Çalışma kayıtlarında şunlar var: ${parts.join(" · ")}. ` +
    "Yalnız bu kayıtlardan en önemli 1-2 eksiği adıyla söyle, neden önce onları kapatmanız gerektiğini tek cümleyle " +
    "açıkla ve birinden başlamayı öneren tek soruyla bitir. Kayıtta olmayan eksik uydurma."
  );
}

export const CHECK_UNDERSTANDING_LINE =
  "ANLADIĞINI TEST ET — BU TUR (kesin): Öğrenci konuyu ne kadar anladığını test etmeni istedi. Konuşmadaki konudan TEK " +
  "soru sor ve cevabını bekle: bu mesajda açıklama, ipucu ya da cevap yok; kısa bir giriş cümlesi yeterli. Soruyu " +
  "istersen mini yoklama biçiminde yaz (ayrı paragraf, yanıtın sonunda):\n" +
  `> ${QUICK_CHECK_MARK} <tek kısa soru>\n` +
  "> A) <kısa şık>\n" +
  "> B) <kısa şık>\n" +
  "(2-4 şık, harfler A'dan sırayla, yalnız biri doğru). Sonraki turlarda cevabı değerlendirip sıradaki tek soruya " +
  `geçeceksin; birden çok soruyu aynı mesajda sorma. ${NO_TOPIC}`;

/** Komutun bu turdaki satırı. "Çok basit anlat" var olan sadeleştirme kuralıyla birleşir (kural yoksa eklenir). */
export function moreCommandLine(id: MoreCommandId, input: { message: string; gaps: TutorGaps | null }): string {
  switch (id) {
    case "private_lesson":
      return PRIVATE_LESSON_LINE;
    case "explain_simple":
      return simplifyLine(input.message) ? EXPLAIN_SIMPLE_LINE : `${SIMPLIFY_LINE}\n\n${EXPLAIN_SIMPLE_LINE}`;
    case "key_concepts":
      return KEY_CONCEPTS_LINE;
    case "connect_concepts":
      return CONNECT_CONCEPTS_LINE;
    case "find_gaps":
      return findGapsLine(input.gaps);
    case "check_understanding":
      return CHECK_UNDERSTANDING_LINE;
  }
}

/* ---------------- Sürmekte olan test ---------------- */

const TEST_LOOKBACK = 8;

/**
 * "Anladığını test et" komutundan sonra öğrenci yalnız test sorularına cevap veriyorsa test sürüyor: bu cevap kaçıncı.
 * Arada yeni bir soru ya da başka bir istek varsa test bitmiştir (null).
 */
export function activeTestRun(history: readonly TurnHistoryItem[], message: string): { answered: number } | null {
  const textOf = (content: unknown) => (typeof content === "string" ? content : "");
  const pairs: { user: string; prevTutor: string }[] = [];
  let lastTutor = "";
  for (const item of history) {
    if (item.role === "assistant") lastTutor = textOf(item.content);
    else if (item.role === "user") pairs.push({ user: textOf(item.content), prevTutor: lastTutor });
  }
  if (!lastTutor || !testAnswer(message, lastTutor)) return null;
  let answered = 1;
  for (let index = pairs.length - 1; index >= 0 && pairs.length - index <= TEST_LOOKBACK; index -= 1) {
    const pair = pairs[index]!;
    if (moreCommandFromMessage(pair.user)?.id === "check_understanding") return { answered };
    if (!pair.prevTutor || !testAnswer(pair.user, pair.prevTutor)) return null;
    answered += 1;
  }
  return null;
}

/** Test sorusuna cevap: kısa cevap denemesi; öğrencinin kendi sorusu ("… nedir?") cevap değildir (tahmin hariç). */
function testAnswer(userText: string, tutorText: string): boolean {
  if (!isAnswerTo(userText, tutorText)) return false;
  return !(looksLikeQuestion(userText) && !hedgedGuess(userText));
}

/* ---------------- Turun satırları ---------------- */

export type LiveTutorTurn = {
  lines: string[];
  /** Bu turda takip soruları eklenmez (karşılama, test sorusu). */
  noFollowUps: boolean;
  command: MoreCommandId | null;
  testRun: { answered: number } | null;
  invite: PrepInviteState["kind"];
};

/**
 * Öğretmen v3'ün bu turdaki satırları (sistem isteminin sonuna, seans satırlarından sonra). Kriz ve yalnız duygu turunda
 * çağrılmaz (güvenlik akışı aynen). Sıra: aktif hazırlık bilgisi, ilk temas, karşılama ya da komut, öneri durumu.
 */
export function liveTutorTurn(input: {
  message: string;
  history: readonly TurnHistoryItem[];
  welcomeAnswer: boolean;
  studentName: string | null;
  activePrep: ActivePrep | null;
  gaps: TutorGaps | null;
  suggestTopic: string | null;
}): LiveTutorTurn {
  const lines: string[] = [];
  const command = input.welcomeAnswer ? null : (moreCommandFromMessage(input.message)?.id ?? null);
  const testRun = input.welcomeAnswer || command ? null : activeTestRun(input.history, input.message);
  // Karşılama ve komut turunda öneri yapılmaz (öğrenci yön verdi); aktif hazırlık bilgisi yine gider.
  const prep = activePrepTurnLines({
    prep: input.activePrep,
    history: input.history,
    message: input.message,
    suggestTopic: input.suggestTopic,
  });
  if (prep.lines[0]) lines.push(prep.lines[0]);
  if (input.studentName && isFirstContact(input.history, input.welcomeAnswer)) lines.push(firstContactLine(input.studentName));
  if (input.welcomeAnswer) lines.push(WELCOME_ANSWER_LINE);
  else if (command) lines.push(moreCommandLine(command, { message: input.message, gaps: input.gaps }));
  const inviteAllowed = !input.welcomeAnswer && !command && !testRun;
  if (inviteAllowed) lines.push(...prep.lines.slice(1));
  return {
    lines,
    noFollowUps: input.welcomeAnswer || command === "check_understanding" || Boolean(testRun),
    command,
    testRun,
    invite: inviteAllowed ? prep.invite : "none",
  };
}

/**
 * Modelin takip soruları → kayda girecek sorular: öğrenci metni süzgecinden ve biçim kuralından geçer; yanıtın kendi
 * sorusuyla aynı olan düşer. Kod soru yazmaz.
 */
export function settleFollowUps(questions: readonly string[], reply: string): string[] {
  const asked = tutorQuestions(reply);
  // Önce temizlenir ve yanıtın sorusunu tekrar eden düşer; sonra tekrarsız en çok üç tane kalır (düşen yerine sıradaki).
  const cleaned = questions
    .map((question) => cleanFollowUp(studentOutputText(question)))
    .filter((question) => question && !repeatsAskedQuestion(question, asked));
  return normalizeFollowUps(cleaned);
}
