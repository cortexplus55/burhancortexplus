/**
 * Tek kart modeli — düğüm, stüdyo, yanlış defteri ve misconception aynı tip.
 */

export type FlashcardKind =
  | "definition"
  | "formula"
  | "fact"
  | "process"
  | "cause_effect"
  | "numeric";

export type FlashcardSource = "node" | "studio" | "mistake" | "misconception";

export type SessionFlashcard = {
  front: string;
  back: string;
  kind: FlashcardKind;
  cardKey: string;
  cardSource: FlashcardSource;
  sourceLabel?: string | null;
  topicId?: string | null;
  topicLabel?: string | null;
  difficulty?: "easy" | "medium" | "hard";
  fromMistake?: boolean;
  /** Sayısal kartta kısa çözüm adımları. */
  steps?: string[];
};

export const KIND_LABEL_TR: Record<FlashcardKind, string> = {
  definition: "Tanım",
  formula: "Formül",
  fact: "Tarih",
  process: "Süreç",
  cause_effect: "Neden-sonuç",
  numeric: "Hesap",
};

/** card_key: kaynak + kimlik veya ön yüz özeti. */
export function makeCardKey(source: FlashcardSource, idOrFront: string): string {
  const slim = idOrFront
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return `${source}:${slim}`;
}

export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
