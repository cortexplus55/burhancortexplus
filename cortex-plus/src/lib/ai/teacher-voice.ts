import { lineHasSymbolicEquation } from "@/lib/text/symbolic-math";

/*
  PROMPT-V2 §7 (ses kılavuzu) ve PR-0 G-1 (ham işaret / üst-alt simge taraması), 15 Kasım 2026. teacher.v2 açıkken ana
  sohbetin bitmiş cevabına uygulanır; modelsiz, ek çağrı yok. Kod cümle YAZMAZ: yasak kalıbı siler ya da kırpar, fazla
  emojiyi atar, sohbet turundaki başlık ve madde işaretini kaldırır, formül dışındaki ham üs/alt simgeyi (2^-3, v_0)
  okunur simgeye çevirir. Formül ($…$, $$…$$) ve kod (`…`) parçalarına dokunulmaz; kutular (">" satırları) yalnız emoji
  sayımına girmez, metinleri aynen kalır.

  Yalnız genel Türkçe sohbet kalıpları; ders ya da konu sözcüğü yok.
*/

export type VoiceResult = {
  text: string;
  /** Silinen ya da kırpılan yasak kalıp ("Harika soru!", "Elbette," …). */
  banned: number;
  /** Silinen doğrulanamayan istatistik cümlesi ("en çok düşülen tuzak" …). */
  stats: number;
  /** Atılan emoji (mesaj başına en çok 1, soru cümlesinde hiç). */
  emoji: number;
  /** Kaldırılan başlık ve madde işareti. */
  structure: number;
  /** Okunur simgeye çevrilen ham üs/alt simge, kapatılan tek "**". */
  rawFixed: number;
  /** Çevrilemeyen ham işaret (formül dışında `\frac` gibi): yalnız ölçü. */
  rawLeft: number;
};

const EMOJI = /\p{Extended_Pictographic}️?/gu;

/** Cümlenin tamamı bu kalıpsa cümle silinir. */
const BANNED_SENTENCE = [
  /^harika (?:bir )?soru$/iu,
  /^(?:çok )?güzel (?:bir )?soru$/iu,
  /^umarım (?:bu )?(?:açıklama |anlatım )?(?:sana )?yardımcı olmuştur$/iu,
  /^başka (?:bir )?(?:sorun|soru|sorunuz) var mı$/iu,
  /^moral bozmak yok$/iu,
  /^elbette$/iu,
  /^tabii(?: ki)?$/iu,
];

/** Cümlenin başındaki yasak açılış kırpılır, gerisi kalır. */
const BANNED_OPENING =
  /^(?:\*\*)?(?:elbette|tabii(?: ki)?|harika (?:bir )?soru|(?:çok )?güzel (?:bir )?soru|moral bozmak yok|özetle|sana şunu söyleyebilirim ki)(?:\*\*)?\s*[!,.:;–—-]?\s*/iu;

/** Cümlenin içindeki dolgu kalıbı kırpılır. */
const BANNED_INLINE = /\s*sana şunu söyleyebilirim ki,?\s*/giu;

/** Kaynağı gösterilemeyen istatistik iddiası: cümle silinir. */
const UNVERIFIED_STAT =
  /en (?:çok|sık) (?:düşülen|yapılan|takılınan|karıştırılan|yanlış yapılan)|öğrencilerin\s+(?:yüzde\s*\d+|%\s*\d+|çoğu|büyük (?:çoğunluğu|kısmı))|çoğu öğrenci|her\s+\d+\s+öğrenciden|öğrencilerin\s+\d+\s*%/iu;

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "+": "⁺",
};
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};

/** Formül ve kod parçaları; bunların içine dokunulmaz. */
const PROTECTED = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]*`)/;

function mapOutside(text: string, fn: (plain: string) => string): string {
  return text
    .split(PROTECTED)
    .map((part, index) => (index % 2 === 1 ? part : fn(part)))
    .join("");
}

const capitalize = (text: string) => text.replace(/^(\s*(?:\*\*)?)(\p{Ll})/u, (_, lead: string, ch: string) => lead + ch.toLocaleUpperCase("tr"));

function bare(sentence: string): string {
  return sentence
    .replace(EMOJI, "")
    .replace(/[*_`#>]/g, "")
    .replace(/[!.?…:;,\s]+$/u, "")
    .trim();
}

export function settleVoice(input: string): VoiceResult {
  const result: VoiceResult = { text: "", banned: 0, stats: 0, emoji: 0, structure: 0, rawFixed: 0, rawLeft: 0 };
  let emojiKept = 0;
  const blocks = input.split(/\n{2,}/).map((block) => {
    if (/^\s*>/.test(block) || /^\s*\$\$/.test(block)) return block;
    // Başlık ve madde işareti (sohbet turunda yok): işaret kalkar, metin kalır.
    let text = block
      .split("\n")
      .map((line) => {
        const heading = line.replace(/^\s{0,3}#{1,6}\s+/, "");
        const bullet = heading.replace(/^\s*[-*•]\s+(?=\S)/, "");
        if (bullet !== line) result.structure += 1;
        return bullet;
      })
      .join("\n");
    // Cümleler ayırıcılarıyla birlikte: silinen cümle kendi ardındaki ayırıcıyla gider, satır sonları korunur.
    const parts = text.split(/((?<=[.!?…])\s+)/u);
    const kept: string[] = [];
    for (let index = 0; index < parts.length; index += 2) {
      let sentence = parts[index]!;
      const separator = parts[index + 1] ?? "";
      if (BANNED_SENTENCE.some((pattern) => pattern.test(bare(sentence)))) {
        result.banned += 1;
        continue;
      }
      if (UNVERIFIED_STAT.test(sentence)) {
        result.stats += 1;
        continue;
      }
      let opened = sentence.replace(BANNED_OPENING, "");
      while (opened !== sentence) {
        result.banned += 1;
        sentence = capitalize(opened);
        opened = sentence.replace(BANNED_OPENING, "");
      }
      const inline = sentence.replace(BANNED_INLINE, " ");
      if (inline !== sentence) {
        result.banned += 1;
        sentence = capitalize(inline.trimStart());
      }
      if (!bare(sentence)) {
        result.emoji += (sentence.match(EMOJI) ?? []).length;
        continue;
      }
      // Emoji: soru cümlesinde hiç, mesajın tamamında en çok bir (kutular hariç).
      const question = /\?\s*(?:\*\*)?\s*$/u.test(sentence);
      sentence = sentence.replace(EMOJI, (match) => {
        if (!question && emojiKept === 0) {
          emojiKept += 1;
          return match;
        }
        result.emoji += 1;
        return "";
      }).replace(/ {2,}/g, " ");
      kept.push(sentence + separator);
    }
    text = kept.join("").trim();
    // G-1: formül dışındaki ham üs ve alt simge; tek kalmış "**".
    text = mapOutside(text, (plain) => plain.split("\n").map((line) => {
      // Faz 2 (madde 1): eşitlik/eşitsizlik/ok taşıyan sembolik ifade ("x^2 - 4 = 0") öğrenciye aktığı gibi kalır.
      if (lineHasSymbolicEquation(line)) return line;
      let next = line.replace(/(?<=[\p{L}\p{N})])\^\(?([-+]?\d{1,3})\)?(?![\p{L}\p{N}])/gu, (_, exp: string) => {
        result.rawFixed += 1;
        return [...exp].map((ch) => SUPERSCRIPT[ch] ?? ch).join("");
      });
      next = next.replace(/(?<=(?:^|[^\p{L}\p{N}_])\p{L})_(\d{1,2})(?![\p{L}\p{N}])/gu, (_, sub: string) => {
        result.rawFixed += 1;
        return [...sub].map((ch) => SUBSCRIPT[ch] ?? ch).join("");
      });
      result.rawLeft += (next.match(/\\(?:frac|sqrt|cdot|times|le|ge|neq|pm|alpha|beta|Delta)\b/g) ?? []).length;
      return next;
    }).join("\n"));
    if (((text.match(/\*\*/g) ?? []).length) % 2 === 1) {
      const last = text.lastIndexOf("**");
      text = text.slice(0, last) + text.slice(last + 2);
      result.rawFixed += 1;
    }
    return text;
  });
  result.text = blocks.filter((block) => block.trim()).join("\n\n");
  return result;
}
