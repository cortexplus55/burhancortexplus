/**
 * Müfredat metninden sınav biçimi çıkarımı.
 * Sayılar metinde birebir doğrulanmadan plana yazılmaz.
 */

import type { MockLengthPreset, MockQuestionType, MockSlotPlan } from "@/lib/learning/mock-exam/types";
import { DEFAULT_SHORT, DEFAULT_STANDARD } from "@/lib/learning/mock-exam/types";

export type ParsedExamFormat = {
  slots: MockSlotPlan[];
  durationMinutes: number;
  summary: string;
};

const NUM = String.raw`(\d{1,3})`;

/**
 * Örnek: "20 çoktan seçmeli (4'er puan) + 2 klasik (10'ar puan), 90 dk"
 * Genel kalıplar; derse özgü kelime yok.
 */
export function parseExamFormatFromText(text: string): ParsedExamFormat | null {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const duration =
    matchInt(raw, new RegExp(`${NUM}\\s*(?:dk|dakika|min(?:ute)?s?)\\b`, "i")) ??
    matchInt(raw, new RegExp(`${NUM}\\s*saat`, "i"), (n) => n * 60);
  if (duration == null || duration < 5 || duration > 300) return null;

  const slots: MockSlotPlan[] = [];

  const mcqBlock = raw.match(
    new RegExp(
      `${NUM}\\s*(?:çoktan\\s*seçmeli|coktan\\s*secmeli|test|mcq|çoktan)\\b(?:[^0-9+]{0,40}?)${NUM}\\s*(?:['']?er\\s*)?(?:puan|pts?)?`,
      "i",
    ),
  );
  if (mcqBlock) {
    const count = Number(mcqBlock[1]);
    const points = Number(mcqBlock[2]);
    if (count >= 1 && count <= 80 && points >= 1 && points <= 20) {
      for (let i = 0; i < count; i += 1) {
        slots.push({ type: "mcq", points });
      }
    }
  }

  const openBlock = raw.match(
    new RegExp(
      `${NUM}\\s*(?:klasik|açık\\s*uçlu|acik\\s*uclu|yazılı|yazili|open)\\b(?:[^0-9+]{0,40}?)${NUM}\\s*(?:['']?ar\\s*)?(?:puan|pts?)?`,
      "i",
    ),
  );
  if (openBlock) {
    const count = Number(openBlock[1]);
    const points = Number(openBlock[2]);
    if (count >= 1 && count <= 20 && points >= 1 && points <= 50) {
      for (let i = 0; i < count; i += 1) {
        slots.push({ type: "open", points });
      }
    }
  }

  // "20 test + 2 klasik" points eksikse varsayılan puan
  if (!slots.length) {
    const simpleMcq = raw.match(
      new RegExp(`${NUM}\\s*(?:çoktan\\s*seçmeli|coktan\\s*secmeli|test)\\b`, "i"),
    );
    const simpleOpen = raw.match(
      new RegExp(`${NUM}\\s*(?:klasik|açık\\s*uçlu|acik\\s*uclu)\\b`, "i"),
    );
    if (simpleMcq) {
      const count = Number(simpleMcq[1]);
      if (count >= 1 && count <= 80) {
        for (let i = 0; i < count; i += 1) slots.push({ type: "mcq", points: 4 });
      }
    }
    if (simpleOpen) {
      const count = Number(simpleOpen[1]);
      if (count >= 1 && count <= 20) {
        for (let i = 0; i < count; i += 1) slots.push({ type: "open", points: 10 });
      }
    }
  }

  if (!slots.length) return null;

  // Metindeki sayılarla birebir doğrula
  const mcqCount = slots.filter((s) => s.type === "mcq").length;
  const openCount = slots.filter((s) => s.type === "open").length;
  if (mcqCount > 0 && !new RegExp(`\\b${mcqCount}\\b`).test(raw)) return null;
  if (openCount > 0 && !new RegExp(`\\b${openCount}\\b`).test(raw)) return null;
  if (!new RegExp(`\\b${duration}\\b`).test(raw) && duration % 60 !== 0) return null;
  if (duration % 60 === 0) {
    const hours = duration / 60;
    if (!new RegExp(`\\b${duration}\\b`).test(raw) && !new RegExp(`\\b${hours}\\b`).test(raw)) {
      return null;
    }
  }

  const parts: string[] = [];
  if (mcqCount) parts.push(`${mcqCount} test`);
  if (openCount) parts.push(`${openCount} klasik`);
  const summary = `${parts.join(" + ")} · ${duration} dk`;

  return { slots, durationMinutes: duration, summary };
}

function matchInt(
  text: string,
  re: RegExp,
  map: (n: number) => number = (n) => n,
): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return map(n);
}

/** Varsayılan karışım: %70 mcq/multi, %15 numeric|tf, %15 short|open. */
export function defaultSlots(
  questionCount: number,
  allowNumeric: boolean,
): MockSlotPlan[] {
  const slots: MockSlotPlan[] = [];
  const multiTarget = Math.max(1, Math.round(questionCount * 0.1));
  const numericOrTf = Math.max(0, Math.round(questionCount * 0.15));
  const shortOrOpen = Math.max(0, Math.round(questionCount * 0.15));
  const mcqCount = Math.max(0, questionCount - multiTarget - numericOrTf - shortOrOpen);

  for (let i = 0; i < mcqCount; i += 1) slots.push({ type: "mcq", points: 4 });
  for (let i = 0; i < multiTarget; i += 1) slots.push({ type: "multi_mcq", points: 4 });

  for (let i = 0; i < numericOrTf; i += 1) {
    const type: MockQuestionType =
      allowNumeric && i % 2 === 0 ? "numeric" : "true_false";
    slots.push({ type, points: type === "numeric" ? 5 : 3 });
  }
  for (let i = 0; i < shortOrOpen; i += 1) {
    const type: MockQuestionType = i % 2 === 0 ? "short_answer" : "open";
    slots.push({ type, points: type === "open" ? 10 : 5 });
  }

  // Tam sayı sapması: fazla/eksik mcq ile kapat
  while (slots.length < questionCount) slots.push({ type: "mcq", points: 4 });
  return slots.slice(0, questionCount);
}

export function presetPlan(
  preset: MockLengthPreset,
  syllabus: ParsedExamFormat | null,
  allowNumeric: boolean,
): {
  questionCount: number;
  durationMinutes: number;
  slots: MockSlotPlan[];
  formatSummary: string | null;
  fromSyllabus: boolean;
} {
  if (preset === "real" && syllabus) {
    return {
      questionCount: syllabus.slots.length,
      durationMinutes: syllabus.durationMinutes,
      slots: syllabus.slots,
      formatSummary: syllabus.summary,
      fromSyllabus: true,
    };
  }
  const base = preset === "short" ? DEFAULT_SHORT : DEFAULT_STANDARD;
  return {
    questionCount: base.questionCount,
    durationMinutes: base.durationMinutes,
    slots: defaultSlots(base.questionCount, allowNumeric),
    formatSummary: null,
    fromSyllabus: false,
  };
}
