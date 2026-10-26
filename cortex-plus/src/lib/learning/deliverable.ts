/**
 * Söz verilen sayı = teslim edilen sayı.
 *
 * Bozuk, konu dışı ya da kopya öğe slota yazılmaz. Kaynak cümlesini ya da
 * kaynaktaki sayıyı aynen taşımamak öğeyi düşürmez: konu doğru ve soru
 * sağlamsa sayılır. Kısa liste yayımlanamaz. `note` her zaman null.
 */

import { examFactOverlap, itemStems, nearDuplicate } from "@/lib/learning/item-dedup";
import { foldValidity, itemValidity, validityKind } from "@/lib/learning/item-validity";
import { measurableTokens } from "@/lib/learning/source-quantities";

export type DeliverySlot = {
  topicId?: string | null;
  topicLabel: string;
  type: string;
  point?: string | null;
  signature?: string | null;
  points?: number;
};

export type DeliveryItem = {
  topicId?: string | null;
  topicLabel: string;
  type: string;
  text: string;
  options?: readonly string[];
  correctAnswers?: readonly string[];
  explanation?: string;
  sourceLabel?: string;
  material?: string;
};

export type DeliveryVerdict<T> = {
  ok: boolean;
  canPublish: boolean;
  /** Yalnız kapı doluysa dolu liste; değilse boş (kısa liste yayımlanmasın). */
  publishable: T[];
  delivered: T[];
  deficits: DeliverySlot[];
  note: null;
  coverage: string[];
};

function blob(item: DeliveryItem): string {
  return [item.text, item.explanation ?? "", item.sourceLabel ?? "", ...(item.options ?? []), ...(item.correctAnswers ?? [])].join("\n");
}

function align(left: string, right: string): boolean {
  const a = foldValidity(left);
  const b = foldValidity(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  for (const stem of itemStems(right)) {
    if (stem.startsWith("#") || stem.startsWith("^") || stem.length < 4) continue;
    if (a.includes(stem)) return true;
  }
  return false;
}

export function sameTopic(item: DeliveryItem, slot: DeliverySlot): boolean {
  if (item.topicLabel.trim() && slot.topicLabel.trim()) return align(item.topicLabel, slot.topicLabel);
  if (!slot.topicLabel.trim()) return true;
  return align(item.text, slot.topicLabel);
}

function typeOk(itemType: string, slotType: string): boolean {
  const open = new Set(["open", "short_answer"]);
  if (open.has(slotType)) return open.has(itemType);
  if (slotType === "card" || slotType === "flashcard") return itemType === "card" || itemType === "flashcard";
  return itemType === slotType;
}

/**
 * Noktanın ölçülebilir parçaları öğede var mı? Yalnız ölçüm.
 * Teslim kapısı bunu ret sebebi yapmaz: soru aynı konuyu başka sayı ve
 * başka bağlamla da sorabilir (26 Ekim 2026).
 */
export function coversPoint(item: DeliveryItem, slot: DeliverySlot): boolean {
  const point = (slot.point ?? "").trim();
  const tokens = point ? measurableTokens(point) : [];
  if (!slot.signature || tokens.length === 0) return true;
  const folded = foldValidity(blob(item));
  return tokens.every((token) => folded.includes(foldValidity(token)));
}

export function factSignature(text: string): string {
  const bits: string[] = [];
  for (const match of text.matchAll(/%\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*%/g)) bits.push(match[0].replace(/\s+/g, ""));
  for (const match of text.matchAll(/\d+\s*\/\s*\d+/g)) bits.push(match[0].replace(/\s+/g, ""));
  for (const match of text.matchAll(/\d+\s*:\s*\d+/g)) bits.push(match[0].replace(/\s+/g, ""));
  for (const match of text.matchAll(/[\p{L}\p{N}]+\s*=\s*[\p{L}\p{N}][^\n.;]{0,24}/gu)) {
    bits.push(match[0].replace(/\s+/g, ""));
  }
  return [...new Set(bits)].sort().join("|");
}

function answerKey(item: DeliveryItem): string {
  const answers = (item.correctAnswers ?? []).map((answer) => foldValidity(answer).replace(/\s+/g, " ").trim()).filter(Boolean).sort();
  return answers.join("|");
}

export function semanticDuplicate(left: DeliveryItem, right: DeliveryItem): boolean {
  const leftFact = factSignature(left.text);
  const rightFact = factSignature(right.text);
  if (leftFact && leftFact === rightFact) return true;
  if (nearDuplicate(left.text, right.text, 0.7)) return true;
  if (examFactOverlap(left.text, right.text, left.topicLabel, right.topicLabel)) return true;
  const leftAnswer = answerKey(left);
  const rightAnswer = answerKey(right);
  if (leftAnswer && rightAnswer && leftAnswer.length >= 8 && leftAnswer === rightAnswer) return true;
  if (leftAnswer && rightAnswer && leftAnswer === rightAnswer && nearDuplicate(left.text, right.text, 0.55)) return true;
  return false;
}

function accept(item: DeliveryItem, slots: readonly DeliverySlot[]): boolean {
  const verdict = itemValidity({
    kind: validityKind(item.type),
    text: item.text,
    options: item.options,
    correct: item.correctAnswers,
    material: item.material,
    payload: blob(item),
  });
  if (!verdict.ok) return false;
  if (item.sourceLabel !== undefined && !item.sourceLabel.trim()) return false;
  return slots.some((slot) => sameTopic(item, slot) && typeOk(item.type, slot.type));
}

/**
 * Slot başına en fazla bir geçerli öğe. Eksik slot `deficits`te kalır.
 * `canPublish` yalnız her slot dolunca true.
 */
export function selectDeliverable<T>(
  slots: readonly DeliverySlot[],
  drafts: readonly T[],
  read: (item: T) => DeliveryItem,
): DeliveryVerdict<T> {
  const views = drafts.map((raw) => ({ raw, view: read(raw) }));
  const pool: { raw: T; view: DeliveryItem }[] = [];
  for (const row of views) {
    if (!accept(row.view, slots)) continue;
    if (pool.some((kept) => semanticDuplicate(kept.view, row.view))) continue;
    pool.push(row);
  }
  const used = new Set<number>();
  const delivered: T[] = [];
  const deficits: DeliverySlot[] = [];
  const coverage: string[] = [];
  for (const slot of slots) {
    let found = -1;
    for (let index = 0; index < pool.length; index += 1) {
      if (used.has(index)) continue;
      const item = pool[index]!;
      if (!typeOk(item.view.type, slot.type)) continue;
      if (!sameTopic(item.view, slot)) continue;
      found = index;
      break;
    }
    if (found < 0) {
      deficits.push(slot);
      continue;
    }
    used.add(found);
    delivered.push(pool[found]!.raw);
    if (slot.signature) coverage.push(slot.signature);
  }
  const ok = deficits.length === 0 && delivered.length === slots.length;
  return {
    ok,
    canPublish: ok,
    publishable: ok ? delivered : [],
    delivered,
    deficits,
    note: null,
    coverage,
  };
}

export function assertDeliverable<T>(
  slots: readonly DeliverySlot[],
  drafts: readonly T[],
  read: (item: T) => DeliveryItem,
): DeliveryVerdict<T> {
  const verdict = selectDeliverable(slots, drafts, read);
  return { ...verdict, note: null, canPublish: verdict.ok, publishable: verdict.ok ? verdict.delivered : [] };
}
