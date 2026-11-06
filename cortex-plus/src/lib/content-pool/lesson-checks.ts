import { stripOptionLetters } from "@/lib/learning/option-text";
import { LESSON_SCREEN_HARD_CAP } from "@/lib/learning/lesson-v3";

/**
 * Havuz dersinde kontrol soruları (6 Kasım 2026, canlı sınav) — ders bağımsız, modelsiz.
 *
 * Hazır müfredat ünitesinin dersi (`poolLessonV3`) yalnız sınav iskeleti olan programlarda (`blueprint.check`) soru
 * taşıyordu; öbür programlarda canlıdaki 7 ekranlık dersin hiç sorusu yoktu, iskeletli derslerde de bölüm başına en çok
 * bir. Kayıtlı havuz dersleri değişmez; soru oynatma anında aynı ünitenin (ve konunun kazanımlarının) DOĞRULANMIŞ soru
 * bankasından (`item_bank`, status verified) serpiştirilir. Kod soru yazmaz: kök, şıklar, anahtar ve açıklama bankadaki
 * hâliyle gelir.
 *
 * Kural: derste en az {@link POOL_LESSON_MIN_CHECKS} soru ve sorusuz en çok {@link POOL_LESSON_MAX_GAP} öğretici ekran
 * art arda (kabaca her 2-3 ekranda bir soru). Soru, sorusuz ekranın sonuna eklenir (ekran başına bir soru kuralı); ekran
 * dolu ya da ekran yetmiyorsa soru kendi ekranına konur ("<başlık>: kendini dene"). Aynı kazanımın sorusu önce.
 */

export const POOL_LESSON_MIN_CHECKS = 3;
/** Sorusuz art arda en çok bu kadar ekran. */
export const POOL_LESSON_MAX_GAP = 2;
const SCREEN_BLOCK_CAP = 12;

export type PoolCheckItem = {
  id: string;
  outcome_id: string;
  stem: string;
  choices: string[];
  answer: number;
  explanation: string | null;
};

type Block = { type: string; [key: string]: unknown };
type Screen = { heading: string; concept?: string; blocks: Block[]; [key: string]: unknown };

/** Bankadaki soru ders kontrolüne uyuyor mu (şemanın sınırları: kök 8-400, 2-6 şık, açıklama ≥ 8). */
export function usablePoolCheck(item: PoolCheckItem): boolean {
  const stem = item.stem?.trim() ?? "";
  const choices = Array.isArray(item.choices) ? item.choices.map((c) => String(c ?? "").trim()) : [];
  return (
    stem.length >= 8 &&
    stem.length <= 400 &&
    choices.length >= 2 &&
    choices.length <= 6 &&
    choices.every((c) => c.length >= 1 && c.length <= 200) &&
    new Set(choices.map((c) => c.toLocaleLowerCase("tr"))).size === choices.length &&
    Number.isInteger(item.answer) &&
    item.answer >= 0 &&
    item.answer < choices.length &&
    (item.explanation?.trim().length ?? 0) >= 8
  );
}

export function poolCheckBlock(item: PoolCheckItem): Block {
  return {
    type: "check",
    check: {
      type: "mcq",
      prompt: item.stem.trim(),
      options: stripOptionLetters(item.choices.map((c) => String(c).trim())),
      answerIndex: item.answer,
      explanation: item.explanation!.trim().slice(0, 600),
    },
  };
}

const hasCheck = (screen: Screen) => screen.blocks.some((block) => block.type === "check");

/** Hangi ekranlara soru gerekir: sorusuz art arda {@link POOL_LESSON_MAX_GAP} ekrandan sonra bir soru. */
export function poolCheckSlots(screens: readonly Pick<Screen, "blocks">[]): number[] {
  const slots: number[] = [];
  let gap = 0;
  screens.forEach((screen, index) => {
    if (hasCheck(screen as Screen)) {
      gap = 0;
      return;
    }
    gap += 1;
    if (gap >= POOL_LESSON_MAX_GAP) {
      slots.push(index);
      gap = 0;
    }
  });
  return slots;
}

/**
 * Soruları derse serpiştirir (saf). `outcomesByScreen[i]` i. ekranın kazanım kimlikleri; o kazanımın sorusu önce,
 * yoksa ünitenin kullanılmamış başka bir sorusu. Ekran sayısı {@link LESSON_SCREEN_HARD_CAP}'i geçmez.
 */
export function interleavePoolChecks<L extends { screens: Screen[] }>(
  lesson: L,
  items: readonly PoolCheckItem[],
  outcomesByScreen: readonly (readonly string[])[] = [],
): { lesson: L; added: number } {
  const pool = items.filter(usablePoolCheck);
  const screens = lesson.screens.map((screen) => ({ ...screen, blocks: [...screen.blocks] }));
  const existing = screens.filter(hasCheck).length;
  if (!pool.length || !screens.length) return { lesson, added: 0 };
  const used = new Set<string>();
  const pick = (outcomes: readonly string[]): PoolCheckItem | null => {
    const want = new Set(outcomes);
    const item = pool.find((row) => !used.has(row.id) && want.has(row.outcome_id)) ?? pool.find((row) => !used.has(row.id));
    if (item) used.add(item.id);
    return item ?? null;
  };
  const slots = poolCheckSlots(screens);
  // En az üç soru: boşluk kuralı yetmezse sorusuz kalan ekranlar baştan sona doldurulur.
  for (let index = 0; existing + slots.length < POOL_LESSON_MIN_CHECKS && index < screens.length; index += 1) {
    if (!hasCheck(screens[index]!) && !slots.includes(index)) slots.push(index);
  }
  slots.sort((a, b) => a - b);
  const extraScreens = new Map<number, Screen[]>();
  let added = 0;
  for (const index of slots) {
    const item = pick(outcomesByScreen[index] ?? []);
    if (!item) break;
    const screen = screens[index]!;
    if (screen.blocks.length < SCREEN_BLOCK_CAP) screen.blocks.push(poolCheckBlock(item));
    else extraScreens.set(index, [...(extraScreens.get(index) ?? []), checkScreen(screen, item)]);
    added += 1;
  }
  // Ekran yetmiyorsa (kısa ders) soru kendi ekranına, ilgili ekranın ardına.
  let order = 0;
  while (existing + added < POOL_LESSON_MIN_CHECKS) {
    const index = order % screens.length;
    const item = pick(outcomesByScreen[index] ?? []);
    if (!item) break;
    extraScreens.set(index, [...(extraScreens.get(index) ?? []), checkScreen(screens[index]!, item)]);
    added += 1;
    order += 1;
  }
  const out: Screen[] = [];
  screens.forEach((screen, index) => {
    out.push(screen);
    out.push(...(extraScreens.get(index) ?? []));
  });
  if (!added) return { lesson, added: 0 };
  return { lesson: { ...lesson, screens: out.slice(0, LESSON_SCREEN_HARD_CAP) }, added };
}

function checkScreen(after: Screen, item: PoolCheckItem): Screen {
  return {
    heading: `${after.heading}: kendini dene`.slice(0, 160),
    concept: (after.concept ?? after.heading).slice(0, 120),
    blocks: [poolCheckBlock(item)],
  };
}
