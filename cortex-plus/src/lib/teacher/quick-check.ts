/*
  Mini yoklama (Faz 11, teacher.v2, 21 Kasım 2026). Yalnız "Adım Adım Öğret" modunda, öğretmen bir kavramın gerçekten
  oturup oturmadığını yoklaması gerektiğinde yanıtta EN ÇOK BİR mini yoklama yazar. Biçim tek kaynak: istem kuralı
  (`QUICK_CHECK_RULE`) ve ayrıştırıcı (`parseQuickCheck`) aynı işaretleri okur. Kurala uymayan blok düz metin kalır
  (ayrıştırıcı null döner, ekran onu bugünkü gibi alıntı kutusu olarak çizer).

  Saf ve modelsiz; ders ya da konu sözcüğü yok.
*/

export const QUICK_CHECK_MARK = "❓ Yoklama:";
export const QUICK_CHECK_MIN_OPTIONS = 2;
export const QUICK_CHECK_MAX_OPTIONS = 4;
const LETTERS = ["A", "B", "C", "D"] as const;

export const QUICK_CHECK_RULE =
  "MİNİ YOKLAMA (yalnız gerektiğinde): Bir kavramı anlattıktan sonra gerçekten oturup oturmadığını yoklaman gerekiyorsa " +
  "yanıtta EN ÇOK BİR mini yoklama kullanabilirsin; her yanıtta değil. Biçim kesin, yanıtın en sonunda ve öncesinde " +
  "boş bir satırla ayrı paragraf:\n" +
  `> ${QUICK_CHECK_MARK} <tek kısa soru>\n` +
  "> A) <kısa şık>\n" +
  "> B) <kısa şık>\n" +
  `(${QUICK_CHECK_MIN_OPTIONS}-${QUICK_CHECK_MAX_OPTIONS} şık, harfler A'dan sırayla, yalnız biri doğru, her şık tek satır). ` +
  "Yoklama kullandığın mesajda ayrıca başka bir soru sorma; doğru şıkkı, ipucunu ya da cevabı yazma. Gerekmiyorsa hiç kullanma.";

export type QuickCheckOption = { letter: string; text: string };

export type QuickCheck = {
  /** Yoklamadan önceki metin (boş olabilir). */
  before: string;
  question: string;
  options: QuickCheckOption[];
  /** Yoklamadan sonraki metin (kural gereği çoğunlukla boş). */
  after: string;
};

/** "> " önekini ve satır sonu boşluğunu atar; alıntı satırı değilse null. */
function quoteLine(line: string): string | null {
  const match = /^\s*>\s?(.*)$/.exec(line);
  return match ? match[1]!.trim() : null;
}

/**
 * Yoklama başlığı: "❓ Yoklama: soru". Kalın yazım ve emoji varyant seçicisi tolere edilir; emoji düşmüşse de okunur
 * (ses kılavuzu soru cümlesindeki emojiyi siler, yoklama ayrı paragrafta değilse "❓" gidebilir).
 */
const HEAD = /^(?:\*\*)?\s*(?:❓️?\s*)?(?:\*\*)?\s*Yoklama\s*:\s*(?:\*\*)?\s*(.+?)\s*(?:\*\*)?\s*$/u;
const OPTION = /^(?:\*\*)?([A-D])\s*[)\.]\s*(?:\*\*)?\s*(.+?)\s*$/u;

/**
 * Metindeki mini yoklama: başlık satırı ve ardından 2-4 şık satırı (A'dan sırayla). Bulunamazsa ya da biçim
 * bozuksa null (ekran bloğu olduğu gibi çizer). Birden fazla yoklama varsa ilki okunur.
 */
export function parseQuickCheck(text: string): QuickCheck | null {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const inner = quoteLine(lines[index]!);
    if (inner == null) continue;
    const head = HEAD.exec(inner);
    if (!head) continue;
    const question = head[1]!.replace(/\*\*/g, "").trim();
    if (question.length < 3) return null;
    const options: QuickCheckOption[] = [];
    let cursor = index + 1;
    for (; cursor < lines.length; cursor += 1) {
      const optionLine = quoteLine(lines[cursor]!);
      if (optionLine == null) break;
      if (!optionLine) continue;
      const option = OPTION.exec(optionLine);
      if (!option) return null;
      const expected = LETTERS[options.length];
      if (option[1] !== expected) return null;
      const body = option[2]!.replace(/\*\*/g, "").trim();
      if (!body) return null;
      options.push({ letter: option[1]!, text: body });
      if (options.length > QUICK_CHECK_MAX_OPTIONS) return null;
    }
    if (options.length < QUICK_CHECK_MIN_OPTIONS) return null;
    return {
      before: lines.slice(0, index).join("\n").trim(),
      question,
      options,
      after: lines.slice(cursor).join("\n").trim(),
    };
  }
  return null;
}

/** Öğrencinin şıkka dokununca göndereceği metin ("Cevabım: B) …"); öğretmenin cevap merdiveni bunu deneme sayar. */
export function quickCheckAnswerPrompt(option: QuickCheckOption): string {
  return `Cevabım: ${option.letter}) ${option.text}`;
}
