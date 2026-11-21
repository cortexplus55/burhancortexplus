import { REMEMBER_MAX_ITEMS, clozeFromFact, splitRememberBlock } from "@/lib/learning/remember-facts";
import { V3_DOC_MARK, V3_GENERAL_MARK, cleanV3Reply } from "@/lib/teacher/v3-reply";

/*
  Ders sonu özeti (öğretmen v3, 21 Kasım 2026, ürün sahibinin onayı): öğrenci sohbetten çıkarken ("←" ya da "Yeni sohbet")
  bu sohbette öğretici yanıt varsa "Bugün öğrendiklerin" penceresi en çok üç madde gösterir. Maddeler modelsiz: öğretmen
  yanıtlarındaki "Akılda kalsın" maddeleri ve `==kilit bilgi==` taşıyan cümleler; en yeni ve en farklı üçü. Her madde genel
  tekrar destesinin kabul ettiği biçimde (kilit bilgi boşluk olur, `clozeFromFact`); kart kurulamayan cümle madde olmaz.
  Kod cümle yazmaz; yalnız öğretmenin kendi cümlesini seçer.
*/

export const RECAP_MAX_ITEMS = REMEMBER_MAX_ITEMS;
/** Destenin kabul ettiği uzunluk (`/api/review/deck`: 4–400 karakter). */
const MIN_CHARS = 8;
const MAX_CHARS = 400;
/** İki madde bu kadar ortak sözcük taşıyorsa aynı bilgidir. */
const SAME_FACT = 0.6;

const CALLOUT_HEAD = /^(?:📌|⚠️?|💡|🧠|✅|🤔|❓️?)\s*[^:\n]{0,28}:\s*/u;

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/==|\*\*|__|`/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): Set<string> {
  return new Set(fold(text).split(" ").filter((word) => word.length > 2));
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common += 1;
  return common / Math.min(a.size, b.size);
}

/** Bir satırdaki kilit bilgi cümleleri (liste, alıntı ve kutu önekleri atılır). */
function keySentences(body: string): string[] {
  const out: string[] = [];
  let inCode = false;
  for (const raw of body.split("\n")) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const bare = raw.replace(/^\s*>\s?/, "").replace(/^\s*#{1,6}\s+/, "").trim();
    // Mini yoklamanın sorusu ve şıkları ders özeti değildir.
    if (/Yoklama\s*:/i.test(bare) || /^(?:\*\*)?[A-D]\s*[).]\s/.test(bare)) continue;
    const line = bare.replace(/^(?:[-*•]|\d+[.)])\s+/, "").replace(CALLOUT_HEAD, "").trim();
    if (!line || line === V3_GENERAL_MARK || line === V3_DOC_MARK) continue;
    if (!line.includes("==")) continue;
    for (const sentence of line.split(/(?<=[.!?])\s+(?=\S)/u)) {
      if (/==(?![\s=])[^=\n]+(?<![\s=])==/.test(sentence)) out.push(sentence.trim());
    }
  }
  return out;
}

function acceptable(item: string): boolean {
  const text = item.trim();
  return text.length >= MIN_CHARS && text.length <= MAX_CHARS && clozeFromFact(text) !== null;
}

/**
 * Özetin maddeleri. `replies` öğretmen yanıtları, sohbet sırasıyla (en eski önce). Yeni yanıt önce; yanıtın içinde
 * "Akılda kalsın" maddeleri cümlelerden önce. Aynı kilit bilgiyi ya da büyük ölçüde aynı sözcükleri taşıyan madde atlanır.
 */
export function lessonRecapItems(replies: readonly string[]): string[] {
  const chosen: { text: string; key: string; words: Set<string> }[] = [];
  for (let index = replies.length - 1; index >= 0 && chosen.length < RECAP_MAX_ITEMS; index -= 1) {
    const { body } = cleanV3Reply(replies[index] ?? "");
    const remember = splitRememberBlock(body);
    const candidates = [...remember.items, ...keySentences(remember.body)];
    for (const candidate of candidates) {
      if (chosen.length >= RECAP_MAX_ITEMS) break;
      const text = candidate.trim();
      if (!acceptable(text)) continue;
      const key = fold(clozeFromFact(text)!.back);
      const bag = words(text);
      if (chosen.some((item) => item.key === key || overlap(item.words, bag) >= SAME_FACT)) continue;
      chosen.push({ text, key, words: bag });
    }
  }
  return chosen.map((item) => item.text);
}
