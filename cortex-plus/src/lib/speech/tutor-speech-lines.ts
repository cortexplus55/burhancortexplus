import { splitTurkishSentencesInline } from "@/lib/text/turkish-sentences";
import { verbalizeAcademicTextForTurkishSpeech } from "@/lib/speech/academic-to-turkish-speech";

/*
  Öğretmen yanıtının sese gidecek satırları (öğretmen v3, 21 Kasım 2026). Yanıt önce akademik seslendirme motorundan
  geçer, sonra cümlelere bölünür: ses cümle cümle üretilir ve önbelleğe girer (aynı cümle ikinci kez ücretlenmez). Uzun
  cümle virgül ve noktalı virgülden bölünür (ses modelinin satır sınırı). Saf; ağ yok.
*/

/** Uca gelen metnin üst sınırı (öğretmen yanıtı ~170 kelime; Hızlı Özet daha uzun olabilir). */
export const TUTOR_TTS_MAX_INPUT = 6000;
/** Bir seslendirme satırının üst sınırı (ses modelinin satır sınırının altında). */
export const TUTOR_TTS_LINE_CHARS = 600;
/** Bir istekte en çok bu kadar satır. */
export const TUTOR_TTS_MAX_LINES = 48;

function splitLong(sentence: string): string[] {
  if (sentence.length <= TUTOR_TTS_LINE_CHARS) return [sentence];
  const parts: string[] = [];
  let current = "";
  for (const piece of sentence.split(/(?<=[,;:])\s+/)) {
    if (current && current.length + piece.length + 1 > TUTOR_TTS_LINE_CHARS) {
      parts.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) parts.push(current);
  // Virgülsüz dev parça: kelime sınırından kesilir.
  return parts.flatMap((part) => {
    if (part.length <= TUTOR_TTS_LINE_CHARS) return [part];
    const out: string[] = [];
    let rest = part;
    while (rest.length > TUTOR_TTS_LINE_CHARS) {
      const cut = rest.lastIndexOf(" ", TUTOR_TTS_LINE_CHARS);
      const at = cut > TUTOR_TTS_LINE_CHARS / 2 ? cut : TUTOR_TTS_LINE_CHARS;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
    return out;
  });
}

/**
 * Yanıt metni → seslendirilecek satırlar (okunuşu Türkçe, her biri sınırın altında). Önce ÖZGÜN metin cümlelere bölünür
 * (okunuşa çevrilen simge küçük harfle başlayabilir: "Na⁺ …" → "sodyum …"; bölücü onu yeni cümle saymazdı), sonra her
 * cümle ayrı okunuşa çevrilir. Kod bloğu bölünmeden önce çıkar.
 */
export function tutorSpeechLines(text: string): string[] {
  const source = String(text ?? "").replace(/```[\s\S]*?```/g, " kod bloğu ");
  const sentences = source
    .split(/\n+/)
    .flatMap((paragraph) => splitTurkishSentencesInline(paragraph))
    .map((sentence) => verbalizeAcademicTextForTurkishSpeech(sentence))
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{L}\d]/u.test(sentence));
  return sentences.flatMap(splitLong).slice(0, TUTOR_TTS_MAX_LINES);
}

/**
 * Hızlı başlangıç: ilk satırlar ayrı istenir (ses ilk cümlede başlasın), kalanı arkadan. İlk parça en az bir cümle,
 * en çok ~220 karakter.
 */
export function splitForFastStart(text: string): [string, string] {
  const sentences = text
    .split(/\n+/)
    .flatMap((paragraph) => splitTurkishSentencesInline(paragraph))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  let head = "";
  let index = 0;
  while (index < sentences.length && (!head || head.length + sentences[index]!.length <= 220)) {
    head = head ? `${head} ${sentences[index]}` : sentences[index]!;
    index += 1;
  }
  return [head, sentences.slice(index).join(" ")];
}
