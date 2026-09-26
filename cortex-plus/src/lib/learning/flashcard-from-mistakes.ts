/**
 * Yanlış defteri / misconception / sözlü-quiz kaçırmalarından ücretsiz kart.
 * Model çağrısı yok — mevcut metinden kurulur.
 */

import {
  makeCardKey,
  type SessionFlashcard,
} from "@/lib/learning/flashcard-model";
import { repairTurkishSurface } from "@/lib/learning/learner-fluency";

export type MistakeCardInput = {
  id: string;
  questionText: string;
  correctAnswer: string | null;
  explanation: string | null;
  topicLabel?: string | null;
};

export type MisconceptionCardInput = {
  id?: string;
  questionPreview: string | null;
  corrected: string | null;
  claim: string | null;
  topicLabel?: string | null;
  wrongType?: string | null;
  sourceKind?: string | null;
};

function firstSentence(text: string, maxWords = 40): string {
  const cleaned = repairTurkishSurface(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return sentence;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function essence(question: string): string {
  const cleaned = repairTurkishSurface(question).replace(/\s+/g, " ").trim();
  if (cleaned.length <= 160) return cleaned;
  return `${cleaned.slice(0, 157)}…`;
}

/**
 * mistake_entries satırından kart. Doğru cevap yoksa null.
 */
export function cardFromMistakeEntry(entry: MistakeCardInput): SessionFlashcard | null {
  const front = essence(entry.questionText);
  if (!front) return null;
  const correct = entry.correctAnswer?.trim();
  if (!correct) return null;
  const why = entry.explanation ? firstSentence(entry.explanation, 24) : "";
  const back = why ? `${correct}. ${why}` : correct;
  return {
    front,
    back: firstSentence(back, 40),
    kind: "definition",
    cardKey: makeCardKey("mistake", entry.id),
    cardSource: "mistake",
    topicLabel: entry.topicLabel ?? null,
    fromMistake: true,
    difficulty: "hard",
  };
}

/**
 * exam_prep_misconceptions veya oral/quiz miss kaydından kart.
 */
export function cardFromMisconception(row: MisconceptionCardInput): SessionFlashcard | null {
  const frontRaw = row.questionPreview?.trim() || row.claim?.trim();
  if (!frontRaw) return null;
  const front = essence(frontRaw);
  const correct = row.corrected?.trim();
  if (!correct) return null;
  const back = firstSentence(correct, 40);
  const id = row.id ?? front;
  const oralOrQuiz =
    row.wrongType === "oral_miss" ||
    row.wrongType === "quiz_miss" ||
    row.wrongType === "oral_blank" ||
    row.wrongType === "oral_quantity";
  return {
    front,
    back,
    kind: "definition",
    cardKey: makeCardKey("misconception", id),
    cardSource: "misconception",
    topicLabel: row.topicLabel ?? null,
    fromMistake: true,
    difficulty: oralOrQuiz || row.sourceKind === "lesson_review" ? "hard" : "medium",
  };
}

export function cardsFromMistakeEntries(entries: MistakeCardInput[]): SessionFlashcard[] {
  const out: SessionFlashcard[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const card = cardFromMistakeEntry(entry);
    if (!card || seen.has(card.cardKey)) continue;
    seen.add(card.cardKey);
    out.push(card);
  }
  return out;
}

export function cardsFromMisconceptions(rows: MisconceptionCardInput[]): SessionFlashcard[] {
  const out: SessionFlashcard[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const card = cardFromMisconception(row);
    if (!card || seen.has(card.cardKey)) continue;
    seen.add(card.cardKey);
    out.push(card);
  }
  return out;
}
