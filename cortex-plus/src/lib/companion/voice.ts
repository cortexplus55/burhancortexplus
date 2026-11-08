import type { Mood } from "@/lib/learning/session-signals";

/**
 * Dost katmanı (8 Kasım 2026, ürün sahibi: "spora birlikte yazılan iki arkadaştan biri gitmek istemeyince öbürü onu
 * ikna eder ya, o destekleyen arkadaş bizim uygulamamız olsun; her ekranda samimiyet").
 *
 * Saf ve modelsiz. Her cümle yalnız elimizdeki gerçek sinyalden kurulur: bugünkü ruh hali, seri, son çalışmadan beri
 * geçen gün, sınava kalan gün, sıradaki adım, saat. Uydurma anı yok ("geçen gün demiştin"), tutulamayan söz yok
 * ("sınavı geçersin"), azar yok. Aynı durumda her gün aynı cümle çıkmasın diye seçim güne bağlı ve kararlı
 * (rastgele değil: sunucu ve tarayıcı aynı cümleyi çizer).
 */
export type CompanionSignals = {
  firstName: string | null;
  /** Bugün (Türkiye günü) işaretlenen ruh hali; işaretlenmediyse null. */
  mood: Mood | null;
  /** Canlı seri (bugün ya da dün çalışıldıysa sayılır). */
  streak: number;
  /** Son çalışmadan beri geçen tam gün; hiç çalışmadıysa null; bugün çalıştıysa 0. */
  daysSinceLast: number | null;
  /** Sınava kalan gün; tarih yoksa null. */
  examDaysLeft: number | null;
  examTitle?: string | null;
  /** Sıradaki adım (varsa): kısa ad ve süresi. */
  nextStep?: { heading: string; kindLabel: string; minutes: number } | null;
  /** Türkiye saatiyle saat (0-23). */
  hour: number;
  /** Güne bağlı kararlı seçim için anahtar ("2026-11-08"). */
  seed: string;
};

export type CompanionLine = {
  text: string;
  reason: "exam_day" | "exam_tomorrow" | "exam_soon" | "welcome_back" | "missed_yesterday" | "mood" | "streak" | "studied_today" | "plain";
};

/** Güne (ve isteğe bağlı eke) bağlı kararlı seçim: aynı gün aynı cümle, ertesi gün büyük olasılıkla başka. */
export function pickBySeed<T>(options: readonly T[], seed: string, salt = ""): T {
  const text = `${seed}:${salt}`;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return options[hash % options.length]!;
}

const MOOD_HOME_LINES: Record<Mood, readonly string[]> = {
  ready: [
    "Enerjin yüksek; bugün zor konuya girmenin tam günü.",
    "Hazırım demişsin. O zaman bugün bir adım fazlasını deneyelim.",
  ],
  curious: [
    "Merak iyi yakıt. Aklına takılan neyse ilk onu konuşalım.",
    "Meraklı günlerde 'neden böyle' soruları en iyi oturur. Sor gitsin.",
  ],
  calm: [
    "Sakin kafayla en iyi öğrenilir. Sıradaki adım hazır, acele yok.",
    "Sakin bir gün: ağır bir konu için iyi fırsat.",
  ],
  neutral: ["Bugün nasıl bir tempo istersen o. Sıradaki adım hazır."],
  low_energy: [
    "Enerjin düşük, biliyorum. Beş dakikalık bir şey seç; en zor kısmı başlamak.",
    "Yorgun günlerde kural basit: küçük bir adım, sonra karar veririz.",
  ],
  stressed: [
    "Stresli olduğunu söyledin. Baskı yok: küçük bir adım, gerisini sonra konuşuruz.",
    "Stres varken uzun plan yapmayalım. Tek bir kısa adım, nefes al, devam.",
  ],
};

const MISSED_LINES = [
  "Dün ara verdin, olur. Bugün tek bir adımla ritmi geri alırız.",
  "Bir gün boşluk kimseyi geri düşürmez. Kaldığın yer hâlâ burada.",
];

const PLAIN_BY_HOUR = {
  morning: ["Sabah saatleri odak için en iyisi. Kısa bir dersle başlayalım mı?", "Güne bir adımla başlamak günün geri kalanını kolaylaştırır."],
  day: ["Araya sıkıştırılmış 10 dakika bile sayılır. Sıradaki adım hazır.", "Bugün ne çalışmak istersin? Kaldığın yer bir dokunuş uzakta."],
  evening: ["Günün sonunda 10 dakika bile fark yaratır. Kısa bir adım atalım mı?", "Akşam kısa tekrar iyi oturur. Sıradaki adım seni bekliyor."],
  night: ["Geç oldu; kısa bir tekrar yapıp bırakmak da bir seçenek.", "Bu saatte ağır konu açma; küçük bir adım yeter."],
} as const;

function dayPart(hour: number): keyof typeof PLAIN_BY_HOUR {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

function stepPhrase(step: CompanionSignals["nextStep"]): string {
  if (!step) return "";
  return ` Sıradaki: ${step.kindLabel.toLocaleLowerCase("tr-TR")}, ~${step.minutes} dk.`;
}

/** Ana ekranda selamın altındaki tek satır. Öncelik: sınav günü > uzun ara > dün kaçtı > ruh hali > seri > saat. */
export function homeLine(signals: CompanionSignals): CompanionLine {
  const { daysSinceLast, examDaysLeft, mood, streak, seed } = signals;
  if (examDaysLeft === 0) {
    return { text: "Bugün sınav günü. Yeni konu açma: sınav sabahı kâğıdıyla 15 dakikalık tekrar yeter.", reason: "exam_day" };
  }
  if (examDaysLeft === 1) {
    return { text: "Yarın sınav. Bugün ağır ders yok: kısa tekrar, erken uyku.", reason: "exam_tomorrow" };
  }
  if (daysSinceLast !== null && daysSinceLast >= 3) {
    const days = daysSinceLast;
    const text = pickBySeed(
      [
        `${days} gündür görüşmedik. Dert değil, kaldığın yer hâlâ burada. Beş dakika, tek adım; gerisini yarın konuşuruz.`,
        `${days} gün ara olmuş. Geri dönmek başlamaktan kolaydır: tek bir kısa adım yeter.`,
      ],
      seed,
      "back",
    );
    return { text: `${text}${stepPhrase(signals.nextStep)}`, reason: "welcome_back" };
  }
  if (examDaysLeft !== null && examDaysLeft <= 3) {
    return {
      text: `Sınava ${examDaysLeft} gün kaldı. Bugün yeni konudan çok tekrar ve zayıf noktalar.${stepPhrase(signals.nextStep)}`,
      reason: "exam_soon",
    };
  }
  if (daysSinceLast === 2) {
    return { text: `${pickBySeed(MISSED_LINES, seed, "missed")}${stepPhrase(signals.nextStep)}`, reason: "missed_yesterday" };
  }
  if (mood && mood !== "neutral") {
    return { text: pickBySeed(MOOD_HOME_LINES[mood], seed, mood), reason: "mood" };
  }
  if (daysSinceLast === 0 && streak >= 2) {
    return { text: `Bugünlük payını yaptın; ${streak} günlük seri sende. Devam edersen bonus, etmezsen de tamam.`, reason: "studied_today" };
  }
  if (streak >= 2) {
    return { text: `${streak} gündür üst üste buradasın. Bugün de bir adım, seri sürsün.${stepPhrase(signals.nextStep)}`, reason: "streak" };
  }
  return { text: pickBySeed(PLAIN_BY_HOUR[dayPart(signals.hour)], seed, "plain"), reason: "plain" };
}

/**
 * Öğretmenin ilk sözü ("Başla"): yalnız ekranda, model çağrısı yok. Duruma göre açılış, sonra her zaman soru.
 */
export function startGreeting(signals: CompanionSignals): string {
  const name = (signals.firstName ?? "").trim();
  const hello = name ? `Merhaba ${name}!` : "Merhaba!";
  const ask = "Aklındaki dersi ya da konuyu yaz; takıldığın bir soru varsa fotoğrafını da gönderebilirsin.";
  if (signals.daysSinceLast !== null && signals.daysSinceLast >= 3) {
    return `${hello} Bir süredir yoktun, sorun değil. Kaldığın yerden mi devam edelim, yoksa bugün başka bir şey mi var? ${ask}`;
  }
  switch (signals.mood) {
    case "stressed":
      return `${hello} Bugün stresli olduğunu söyledin; o zaman en kolay yerden başlayalım, tek seferde tek adım. ${ask}`;
    case "low_energy":
      return `${hello} Enerjin düşükken uzun ders açmayalım; kısa ve net gideriz. ${ask}`;
    case "ready":
      return `${hello} Enerjin yüksekmiş, bugün zorlayıcı bir şey seçebiliriz. ${ask}`;
    case "curious":
      return `${hello} Meraklı bir gün; "neden böyle" sorularını sormaktan çekinme. ${ask}`;
    default:
      return `${hello} Bugün ne çalışmak istersin? ${ask}`;
  }
}

/** Ders açılış kartında, ruh hali işaretlendikten sonra tek cümle. Nötrde yok. */
export function moodAcknowledgement(mood: Mood | null | undefined, minutes: number | null): string | null {
  const span = minutes ? `~${minutes} dakika` : "kısa";
  switch (mood) {
    case "stressed":
      return `Stresli günlerde tek kural: küçük parçalar. Bu ders ${span}; istediğin yerde durabilirsin, kaldığın yer saklanır.`;
    case "low_energy":
      return `Enerjin düşükken ${span} tam kıvamında. Sadece başla; gerisi akar.`;
    case "ready":
      return "Hazırsan sorular biraz daha zorlayıcı gelebilir; tam da bugün için.";
    case "curious":
      return "Meraklıysan aklına takılanı dersin sonunda öğretmene sor; o cevabı derse bağlar.";
    case "calm":
      return "Sakin kafayla iyi öğrenilir. Acele yok.";
    default:
      return null;
  }
}

/** Yanlış cevaptan sonra koç cümlesinin ruh haline göre hâli; varsayılan için null (eski cümle kalır). */
export function wrongAnswerLine(mood: Mood | null | undefined): string | null {
  switch (mood) {
    case "stressed":
      return "😮‍💨 Nefes al; bu yanlış burada çıktı, sınavda değil. On saniyede mantığını kilitleyelim 👇";
    case "low_energy":
      return "🙂 Yanlış oldu, olsun. Tek cümlelik açıklamaya bak, sonra devam.";
    case "ready":
      return "💪 Bu tuzağı yedik ama iyi ki burada. Mantığı kilitle, bir dahakine düşmezsin 👇";
    default:
      return null;
  }
}
