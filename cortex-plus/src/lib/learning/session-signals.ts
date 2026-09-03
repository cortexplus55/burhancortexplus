/**
 * Ders başına toplanan iki sinyal: konuya aşinalık ve o anki ruh hali.
 *
 * `tutor-style.ts` ile aynı desen — seçenek listesi, parse, prompt cümlesi.
 * Aşinalık zorluğu, ruh hali tonu belirler; ikisi de sistem mesajına eklenir.
 */

export type Familiarity = "new" | "heard" | "basics" | "good" | "confident";
export type Mood =
  | "ready"
  | "curious"
  | "calm"
  | "neutral"
  | "low_energy"
  | "stressed";

/** Bitki büyüme metaforu — soyut bir 1-5 ölçeğinden daha okunur. */
export const FAMILIARITY_OPTIONS: {
  id: Familiarity;
  emoji: string;
  title: string;
}[] = [
  { id: "new", emoji: "🌱", title: "Bu benim için yeni" },
  { id: "heard", emoji: "🌿", title: "Duymuştum" },
  { id: "basics", emoji: "🪴", title: "Temel bilgileri biliyorum" },
  { id: "good", emoji: "🌲", title: "İyi anlıyorum" },
  { id: "confident", emoji: "🍎", title: "Bu konuda kendime güveniyorum" },
];

export const MOOD_OPTIONS: { id: Mood; emoji: string; title: string }[] = [
  { id: "ready", emoji: "💪", title: "Hazırım" },
  { id: "curious", emoji: "🤔", title: "Meraklı" },
  { id: "calm", emoji: "😌", title: "Sakin" },
  { id: "neutral", emoji: "😐", title: "Nötr" },
  { id: "low_energy", emoji: "😪", title: "Düşük enerji" },
  { id: "stressed", emoji: "😬", title: "Stresli" },
];

export const DEFAULT_FAMILIARITY: Familiarity = "basics";
export const DEFAULT_MOOD: Mood = "neutral";

export function parseFamiliarity(value: unknown): Familiarity {
  return FAMILIARITY_OPTIONS.some((o) => o.id === value)
    ? (value as Familiarity)
    : DEFAULT_FAMILIARITY;
}

export function parseMood(value: unknown): Mood {
  return MOOD_OPTIONS.some((o) => o.id === value) ? (value as Mood) : DEFAULT_MOOD;
}

/** Aşinalık → içeriğin nereden başlayacağı ve ne kadar hızlı ilerleyeceği. */
export function familiarityPrompt(level: Familiarity): string {
  switch (level) {
    case "new":
      return "Öğrenci bu konuyu ilk kez görüyor: sıfırdan başla, terimleri tanımlamadan kullanma, gündelik benzetmelerle ilerle.";
    case "heard":
      return "Öğrenci konunun adını duymuş ama içeriğini bilmiyor: temelden başla ama fazla oyalanma, hızlıca örneğe geç.";
    case "good":
      return "Öğrenci konuyu iyi anlıyor: tanımlarda vakit kaybetme, ince ayrıntılara ve sık yapılan hatalara odaklan.";
    case "confident":
      return "Öğrenci kendine güveniyor: doğrudan sınav seviyesinde zorlu örneklerle ilerle, temel tekrarını atla.";
    default:
      return "Öğrenci temel bilgilere sahip: tanımları kısa geç, ağırlığı uygulamaya ve problem çözümüne ver.";
  }
}

/** Ruh hali → anlatımın tonu, temposu ve parça büyüklüğü. */
export function moodPrompt(mood: Mood): string {
  switch (mood) {
    case "ready":
      return "Öğrencinin enerjisi yüksek: tempoyu yüksek tut, doğrudan ilerle, fazla ısınma turu yapma.";
    case "curious":
      return "Öğrenci meraklı: 'neden böyle' sorularına yer ver, konuyu bağlamıyla birlikte anlat.";
    case "calm":
      return "Öğrenci sakin: ölçülü ve akıcı bir tonla, aceleye getirmeden anlat.";
    case "low_energy":
      return "Öğrencinin enerjisi düşük: içeriği kısa parçalara böl, cümleleri kısa tut, bilişsel yükü azalt, tek seferde az şey iste.";
    case "stressed":
      return "Öğrenci stresli: önce kısa bir cümleyle sakinleştir, konuyu küçük ve net adımlara böl, başarabileceğini hatırlat, sınav baskısını vurgulama.";
    default:
      return "Öğrenci nötr: dengeli ve net bir tonla anlat.";
  }
}

/** İki sinyali tek bir prompt ekine çevirir. */
export function sessionSignalsPrompt(
  familiarity: Familiarity,
  mood: Mood,
): string {
  return `${familiarityPrompt(familiarity)} ${moodPrompt(mood)}`;
}

export function familiarityLabel(level: Familiarity): string {
  return FAMILIARITY_OPTIONS.find((o) => o.id === level)?.title ?? "";
}

export function moodLabel(mood: Mood): string {
  return MOOD_OPTIONS.find((o) => o.id === mood)?.title ?? "";
}
