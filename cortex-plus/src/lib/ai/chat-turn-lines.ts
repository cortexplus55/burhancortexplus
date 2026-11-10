import {
  carriesLessonQuestion,
  detectMessageEmotion,
  emotionMood,
  explicitCrisisSignal,
  generalFeelingStatement,
  type MessageEmotion,
} from "@/lib/learning/message-feelings";
import type { Mood } from "@/lib/learning/session-signals";
import { planTurn, type TurnHistoryItem, type TurnPlan } from "@/lib/learning/tutor-turn";
import { STEP_CONTINUE_WORD, type TutorStyle } from "@/lib/learning/tutor-style";

/**
 * Tura özel istem satırları (10 Kasım 2026, güven paketi). Sohbetin sabit istemi her turda aynıdır; bu satırlar yalnız
 * o turun gerektirdiğini söyler ve sistem isteminin EN SONUNA eklenir (sabit önek önbelleği bozulmaz, son söz olur):
 *
 * - Adım Adım modunda çözülecek soru → yalnız sıradaki tek adım ve "Devam et" daveti;
 * - takip mesajı ("devam et", "cevap kaç?") → aktif soru kilidi: yeni soru uydurulmaz;
 * - mesajda ders sorusu + duygu → ilk cümle duyguya göre açılır;
 * - yalnız genel duygu ifadesi → doğal öğretmen karşılığı, kriz sorusu yok;
 * - açık kriz ifadesi → güvenlik öne alınır.
 *
 * Satırlar cevaba cümle eklemez; modele o turda nasıl yazacağını söyler. Biçimi anlatır, konu örneği taşımaz.
 */

export type ChatTurn = {
  plan: TurnPlan;
  /** Mesajdan okunan duygu; yoksa null. */
  emotion: MessageEmotion | null;
  /** Bu turun ruh hali: mesajdaki duygu, yoksa günün kaydı (hap ya da ders kartı). */
  mood: Mood;
  /** Mesajda ya da görünen geçmişte açık kendine zarar verme / intihar / akut tehlike ifadesi var. */
  crisis: boolean;
  /** Ders sorusu taşımayan genel duygu mesajı. */
  feelingOnly: boolean;
  /** Mesajda duygunun yanında ders sorusu da var. */
  feelingWithQuestion: boolean;
};

export function readChatTurn(input: {
  message: string;
  style: TutorStyle;
  history: readonly TurnHistoryItem[];
  /** Günün ruh hali (hap ya da kayıt); mesajda duygu yoksa bu geçerlidir. */
  baseMood: Mood;
}): ChatTurn {
  const emotion = detectMessageEmotion(input.message);
  const feeling = generalFeelingStatement(input.message);
  const withQuestion = feeling && carriesLessonQuestion(input.message);
  const crisis =
    explicitCrisisSignal(input.message) ||
    input.history.some(
      (item) => item.role === "user" && typeof item.content === "string" && explicitCrisisSignal(item.content),
    );
  return {
    plan: planTurn({ message: input.message, style: input.style, history: input.history }),
    emotion,
    mood: emotion ? emotionMood(emotion) : input.baseMood,
    crisis,
    feelingOnly: feeling && !withQuestion,
    feelingWithQuestion: Boolean(emotion) && withQuestion,
  };
}

export const CRISIS_TURN_LINE =
  "GÜVENLİK — BU TUR (kesin; öbür bütün kurallardan önce gelir): Öğrenci bu konuşmada açıkça kendine zarar vermekten, " +
  "intihardan ya da acil bir tehlikeden söz etti. Dersi bir kenara bırak: soru çözme, konu anlatma, kutu ve işaret " +
  "kullanma. Sıcak ve yargısız konuş: onu önemsediğini ve bunu tek başına taşımak zorunda olmadığını söyle; şu an güvende " +
  "olup olmadığını sor; güvendiği bir yetişkinle (ailesinden biri, bir öğretmeni, okul rehberlik servisi) konuşmasını " +
  "öner; ALO 183 Sosyal Destek Hattı'nı ve acil tehlikede 112'yi söyle. Hafife alma, nasihat etme, konuyu değiştirme.";

export const GENERAL_FEELING_TURN_LINE =
  "DUYGU İFADESİ — BU TUR (kriz değil): Öğrencinin mesajı genel bir duygu ifadesi; konuşmada kendine zarar verme, intihar " +
  "ya da acil tehlike sözü yok. Güvenlik ya da kriz sorusu sorma, yardım hattı önerme; ders anlatmaya da atlama. Bir " +
  "öğretmen gibi doğal karşıla: tek cümleyle anladığını göster, nasıl hissettiğini biraz açmak isteyip istemediğini sor " +
  "ve konunun mu yorucu geldiğini yoksa anlatım hızını mı değiştirmek gerektiğini sor. Kutu, işaret ve liste kullanma. " +
  "Öğrenci açıkça kendine zarar vermekten ya da bir tehlikeden söz ederse bu satır geçmez; o zaman güvenliğini öne al.";

const EMOTION_HEAD =
  "DUYGU — BU TUR (kesin; 'duygu cümlesiyle başlama' ve 'ilk cümle tam cevap' kuralları bu turda ikinci cümleden başlar): ";

const EMOTION_OPENING: Record<MessageEmotion, string> = {
  bored:
    "Öğrencinin mesajında hem ders sorusu hem sıkılma ya da kolay bulma ifadesi var. İlk cümlede bunun ona kolay geldiğini " +
    "kabul et (tek kısa cümle, abartısız). Sonra sorusunu uzatmadan karşıla: cevabını yazdıysa doğruluğunu tek cümleyle " +
    "söyle, yazmadıysa seçili anlatım modunun izin verdiğini en kısa hâliyle ver. Ardından hemen daha zor bir soru teklif " +
    "et (çok adımlı ya da sınav tuzağı içeren); soruyu ancak öğrenci kabul ederse sor.",
  frustrated:
    "Öğrencinin mesajında hem ders sorusu hem sinir ya da öfke ifadesi var. İlk cümlede gerginliğini anladığını söyle (tek " +
    "kısa cümle; savunma, nasihat ve 'sakin ol' yok). Tempoyu yavaşlat: çözümün yalnız tek adımını, en sade hâliyle ve kısa " +
    "cümlelerle ver; uzun liste, yeni terim ve sınav baskısı yok. Sonda yalnız o adımın oturup oturmadığını sor.",
  anxious:
    "Öğrencinin mesajında hem ders sorusu hem kaygı ya da panik ifadesi var. İlk cümlede sakinleştirici bir güvence ver (tek " +
    "kısa cümle, abartısız; tutulamayacak söz yok). Sorunun en kolay parçasından başla ve bu mesajda yalnız onu ver; " +
    "kalanını birlikte, sırayla yapacağınızı söyle.",
};

/** Mesajda ders sorusu + duygu varken ilk cümleyi duyguya göre açtıran satır. */
export function emotionTurnLine(emotion: MessageEmotion): string {
  return `${EMOTION_HEAD}${EMOTION_OPENING[emotion]}`;
}

const STEP_HEAD =
  "ADIM ADIM — BU TUR (kesin; 'adım adım çöz, sağlamasını yap, öbür şıkları ele' ve 'ilk cümle tam cevap' kurallarından " +
  "önce gelir): ";

/** Adım Adım modunda bu turda yazılacak tek adımı söyleyen satır. `step` 0 ise numara bilinmiyor. */
export function stepTurnLine(step: number): string {
  if (step === 1) {
    return (
      `${STEP_HEAD}Öğrenci çözülecek bir soru getirdi. Çözümü içinden sonuna kadar yap ve sağla, ama bu mesajda YALNIZ ` +
      "1. adımı yaz: verilenler, kurulacak bağıntı ve ilk işlemin kurgusu. Nihai cevabı, doğru şıkkı, sayısal sonucu ve " +
      "sonraki adımları YAZMA; kontrol sorusu ve 'Akılda kalsın' kutusu son adıma kalır. Adımı \"**1. adım:**\" başlığıyla " +
      `başlat ve mesajı şu anlamda tek cümleyle bitir: 1. adım netleştiyse '${STEP_CONTINUE_WORD}' yaz, 2. adıma geçelim.`
    );
  }
  const which = step > 1 ? `${step}. adımı` : "sıradaki tek adımı";
  const heading = step > 1 ? `"**${step}. adım:**"` : "\"**N. adım:**\" (kaçıncı adımsa o numarayla)";
  const next = step > 1 ? `${step + 1}. adıma` : "sıradaki adıma";
  return (
    `${STEP_HEAD}Öğrenci aynı sorunun devamını istedi. Bu mesajda YALNIZ ${which} yaz (${heading} başlığıyla); önceki ` +
    "adımları tekrar etme, sonrakileri yazma. Bu adım çözümün son adımıysa nihai cevabı söyle, sağlamasını yap ve davet " +
    `yazma; değilse mesajı şu anlamda tek cümleyle bitir: bu adım netleştiyse '${STEP_CONTINUE_WORD}' yaz, ${next} geçelim.`
  );
}

export const STEP_FULL_SOLUTION_LINE =
  `${STEP_HEAD}Öğrenci tam çözümü açıkça istedi: adımları tek tek bekletme; bütün adımları ayrı satırlarda ve nihai ` +
  "cevabı tek mesajda ver, sağlamasını yap.";

const LOCK_HEAD =
  "AKTİF SORU KİLİDİ (kesin, bu tur): Öğrencinin bu mesajı yeni bir soru değil; konuşmada en son çözülmekte olan sorunun " +
  "devamıdır. Yeni sayılarla, yeni bir senaryoyla ya da benzer bir örnekle soru UYDURMA; soruyu değiştirme. Sayıları ve " +
  "verilenleri o sorudan birebir al. Yeni alıştırma yalnız öğrenci açıkça isterse sorulur. ";

/** Takip mesajında ("devam et", "cevap kaç?") öğretmeni konuşmadaki soruya bağlayan satır. */
export function activeQuestionLine(plan: TurnPlan, style: TutorStyle): string {
  if (!plan.followUp || !plan.active) return "";
  const ask =
    plan.followUp === "final_answer"
      ? "Öğrenci bu sorunun sonucunu açıkça istedi: nihai cevabı ilk cümlede ver, gerekçesi tek satır."
      : plan.followUp === "full_solution"
        ? "Öğrenci tam çözümü açıkça istedi: bu sorunun kalan bütün adımlarını ve nihai cevabını tek mesajda ver, sağlamasını yap."
        : style === "hints_first"
          ? "Bu sorunun sıradaki ipucunu ya da adımını ver; nihai cevabı öğrenci açıkça istemedikçe yazma."
          : style === "step_by_step"
            ? "Bu sorunun sıradaki adımını ver."
            : "Bu sorunun çözümünü kaldığı yerden sürdür.";
  const which =
    plan.active.source === "student"
      ? ` Öğrencinin konuşmada getirdiği son soru: «${plan.active.text.replace(/\s+/g, " ").trim()}»`
      : " Aktif soru konuşmanın içindedir (öğrencinin isteğiyle senin sorduğun son alıştırma ya da kontrol sorusu dahil); " +
        "çözülmekte olan bir soru bulamazsan soru uydurma, hangisini sürdürmek istediğini tek cümleyle sor.";
  return `${LOCK_HEAD}${ask}${which}`;
}

/**
 * Turun satırları, sistem isteminin sonuna eklenecek sırayla. `priorSupport`: öğrencinin yakın zamanda destek
 * yanıtı almış olması (kayıt okunamadıysa da true verilir); o zaman genel duygu ifadesi hafife alınmaz.
 */
export function chatTurnLines(turn: ChatTurn, style: TutorStyle, options: { priorSupport?: boolean } = {}): string[] {
  if (turn.crisis || (turn.feelingOnly && options.priorSupport)) return [CRISIS_TURN_LINE];
  const lines: string[] = [];
  const lock = activeQuestionLine(turn.plan, style);
  if (lock) lines.push(lock);
  if (style === "step_by_step") {
    if (turn.plan.pacedStep != null) lines.push(stepTurnLine(turn.plan.pacedStep));
    else if (turn.plan.fullSolution && turn.plan.problem) lines.push(STEP_FULL_SOLUTION_LINE);
  }
  if (turn.feelingOnly && !turn.plan.followUp) lines.push(GENERAL_FEELING_TURN_LINE);
  else if (turn.emotion && turn.feelingWithQuestion) lines.push(emotionTurnLine(turn.emotion));
  return lines;
}

/** Satırların sistem istemine eklenecek hâli; satır yoksa boş. */
export function chatTurnBlock(lines: readonly string[]): string {
  return lines.length ? `\n\n${lines.join("\n\n")}` : "";
}
