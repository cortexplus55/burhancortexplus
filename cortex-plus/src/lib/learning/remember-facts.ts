import { calloutOf, quoteBlockText } from "@/lib/markdown-core";

/**
 * "Akılda kalsın" (8 Kasım 2026, sohbet öğretim dili). Öğretmen cevabın sonunda en önemli 1-3 bilgiyi alıntı
 * kutusunda listeler; her maddede tek bir ==kilit bilgi== bulunur. Ekran bu kutuyu cevaptan ayırır ve "Tekrarıma
 * ekle" düğmeli kartla çizer; düğme her maddeyi boşluk doldurma kartına çevirir (kilit bilgi boşluk olur).
 * Model çağrısı yok: kartın sorusu ve cevabı öğretmenin kendi cümlesinden.
 */
export const REMEMBER_MAX_ITEMS = 3;

export type RememberSplit = { body: string; items: string[] };

/** Cevabı "Akılda kalsın" kutusu ve geri kalanı olarak ayırır. Kutu yoksa `items` boş, metin aynen. */
export function splitRememberBlock(text: string): RememberSplit {
  const lines = text.split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*>/.test(lines[index])) continue;
    const head = lines[index].replace(/^\s*>\s?/, "");
    if (calloutOf(head)?.kind === "remember") {
      start = index;
      break;
    }
  }
  if (start < 0) return { body: text, items: [] };
  let end = start;
  while (end + 1 < lines.length && /^\s*>/.test(lines[end + 1])) end += 1;
  const inner = quoteBlockText(lines.slice(start, end + 1).join("\n")) ?? "";
  const callout = calloutOf(inner);
  const items = (callout?.body ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((line) => line.length >= 4)
    .slice(0, REMEMBER_MAX_ITEMS);
  if (!items.length) return { body: text, items: [] };
  const body = [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { body, items };
}

export type ClozeCard = { front: string; back: string };

/**
 * Maddeyi boşluk doldurma kartına çevirir: ilk ==kilit bilgi== boşluk olur, cevap odur. Kilit bilgisi olmayan madde
 * kart olmaz (soru kuramayız; uydurmayız). Kalan işaretler düz metne döner.
 */
export function clozeFromFact(fact: string): ClozeCard | null {
  const match = fact.match(/==(?![\s=])([^=\n]{1,160}?)(?<![\s=])==/);
  if (!match) return null;
  const back = match[1].trim();
  const front = fact
    .replace(match[0], "_____")
    .replace(/==([^=\n]+)==/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
  if (front.length < 8 || !back) return null;
  return { front, back };
}

/** Ekranda maddenin düz hâli (işaretler çizici tarafından biçimlenir; burada yalnız uzunluk sınırı). */
export function rememberItemsValid(items: unknown): items is string[] {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.length <= REMEMBER_MAX_ITEMS &&
    items.every((item) => typeof item === "string" && item.trim().length >= 4 && item.length <= 400)
  );
}
