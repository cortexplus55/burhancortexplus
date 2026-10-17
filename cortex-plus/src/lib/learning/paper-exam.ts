/**
 * Kâğıtta çöz (17 Ekim 2026, ürün sahibinin kararı: Astra'daki gibi).
 *
 * Astra'da canlı bakıldı: "Nasıl çözmek istiyorsun? Uygulamada / Kağıtta" → çalışma
 * kâğıdı yazdırılır ("Önce çalışma kağıdını yazdır"; Başla ancak sonra açılır) →
 * halka sayaç "89:59 kaldı" → "Bitir ve çözümlerini yükle" → her sayfanın fotoğrafı
 * (en çok 10) → "el yazını okuyup çözümlerini değerlendirir ve not verir".
 *
 * Bizde fotoğraflar öğretmen modeline okutulur; okunan cevaplar uygulamadaki cevapla
 * aynı biçime çevrilir (çoktan seçmelide şıkkın metni, çok cevaplıda liste, açık uçluda
 * yazı) ve aynı notlandırmadan geçer.
 */

export const PAPER_MAX_PHOTOS = 10;
export const PAPER_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export type PaperQuestion = {
  id: string;
  text: string;
  options: string[];
  question_type: string;
};

/** Modelin okuduğu tek soru: numara (1'den), işaretli harfler, yazılı cevap. */
export type PaperRead = { n: number; choices?: string[]; text?: string; unreadable?: boolean };

const CHOICE_TYPES = new Set(["mcq", "multi_mcq", "true_false"]);

/** Kâğıtta şıkları olan soru (çoktan seçmeli, çok cevaplı, doğru/yanlış). */
export function isChoiceQuestion(question: PaperQuestion): boolean {
  return CHOICE_TYPES.has(question.question_type) && question.options.length > 0;
}

export const PAPER_READ_SYSTEM =
  "Fotoğraflarda bir öğrencinin kâğıt üzerinde çözdüğü sınav var. Sana soruların listesini (numara, tür, şıklar) " +
  "veriyorum. Her soru için öğrencinin cevabını oku:\n" +
  "- Şıklı soruda öğrencinin işaretlediği kutu(lar)ın harfini yaz (A, B, C…). Karalanmış/silinmiş işaret sayılmaz. " +
  "İşaret yoksa choices boş dizi.\n" +
  "- Yazılı cevaplı soruda öğrencinin yazdığını OLDUĞU GİBİ yaz; düzeltme, tamamlama, yorum yok. Sayıda birimi de yaz.\n" +
  "- Okuyamadığın ya da fotoğrafta görünmeyen soruda unreadable true.\n" +
  "- Cevabı sen çözme; yalnız öğrencinin yazdığını oku. Soru numarası kâğıttaki numaradır; öğrenci cevabı kendi " +
  "kâğıdında devam ettirdiyse yanındaki soru numarasına bak.\n" +
  'Yalnız JSON döndür: {"answers":[{"n":1,"choices":["B"]},{"n":2,"text":"…"},{"n":3,"unreadable":true}]}';

export function paperReadUserPrompt(questions: PaperQuestion[]): string {
  const lines = questions.map((question, index) => {
    const n = index + 1;
    if (isChoiceQuestion(question)) {
      const letters = question.options.map((_, i) => PAPER_LETTERS[i] ?? String(i + 1)).join(", ");
      const multi = question.question_type === "multi_mcq" ? " (birden fazla işaret olabilir)" : "";
      return `${n}. şıklı soru${multi}; şıklar: ${letters}`;
    }
    return `${n}. yazılı cevaplı soru`;
  });
  return `SORULAR (${questions.length}):\n${lines.join("\n")}`;
}

export function parsePaperRead(raw: unknown): PaperRead[] {
  const list = (raw as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const n = Number(row.n);
    if (!Number.isInteger(n) || n < 1) return [];
    return [
      {
        n,
        choices: Array.isArray(row.choices) ? row.choices.map((value) => String(value).trim().toUpperCase()) : undefined,
        text: typeof row.text === "string" ? row.text.trim() : undefined,
        unreadable: row.unreadable === true,
      },
    ];
  });
}

/**
 * Okunanı uygulamadaki cevap biçimine çevirir. Harf şık metnine; tek cevaplıda birden çok
 * işaret ya da tanınmayan harf boş sayılır (kâğıttaki kural: "tek kutucuğu işaretle").
 */
export function paperAnswers(
  questions: PaperQuestion[],
  read: PaperRead[],
): { answers: Record<string, string | string[]>; unread: number[] } {
  const byNumber = new Map(read.map((row) => [row.n, row]));
  const answers: Record<string, string | string[]> = {};
  const unread: number[] = [];
  questions.forEach((question, index) => {
    const n = index + 1;
    const row = byNumber.get(n);
    if (!row || row.unreadable) {
      unread.push(n);
      return;
    }
    if (isChoiceQuestion(question)) {
      const picked = [...new Set(row.choices ?? [])]
        .map((letter) => PAPER_LETTERS.indexOf(letter as (typeof PAPER_LETTERS)[number]))
        .filter((i) => i >= 0 && i < question.options.length)
        .map((i) => question.options[i]!);
      if (question.question_type === "multi_mcq") {
        if (picked.length) answers[question.id] = picked;
      } else if (picked.length === 1) {
        answers[question.id] = picked[0]!;
      }
      return;
    }
    if (row.text) answers[question.id] = row.text.slice(0, 2000);
  });
  return { answers, unread };
}
