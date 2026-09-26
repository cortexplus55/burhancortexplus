/** Yazılı deneme tek motor — ortak tipler. */

export type MockQuestionType =
  | "mcq"
  | "multi_mcq"
  | "true_false"
  | "numeric"
  | "short_answer"
  | "open";

export type MockExamScope = "all" | "topics";

export type MockLengthPreset = "short" | "standard" | "real";

export type MockTopicSlot = {
  topicId: string | null;
  topicLabel: string;
  weightPercent: number | null;
  examHeavy: boolean;
  outOfScope: boolean;
  /** Kaynak pasaj uzunluğu (ağırlık yoksa dağıtım). */
  passageChars: number;
};

export type MockSlotPlan = {
  type: MockQuestionType;
  points: number;
};

export type MockExamBlueprint = {
  preset: MockLengthPreset;
  questionCount: number;
  durationMinutes: number;
  slots: MockSlotPlan[];
  /** Müfredattan çıkarıldıysa özet, ör. "20 test + 2 klasik · 90 dk". */
  formatSummary: string | null;
  fromSyllabus: boolean;
  /** Konu başına soru sayısı (kapsam içi). */
  allocation: Array<{
    topicId: string | null;
    topicLabel: string;
    count: number;
    weightPercent: number | null;
    examHeavy: boolean;
  }>;
  allowNumeric: boolean;
};

export type MockSourceRef = {
  documentId: string | null;
  page: number | null;
  label: string;
};

export type MockRubricItem = {
  criterion: string;
  points: number;
};

export type MockExamQuestionDraft = {
  text: string;
  type: MockQuestionType;
  options: string[];
  correctAnswers: string[];
  points: number;
  explanation: string;
  optionWhy: string[];
  rubric: MockRubricItem[];
  modelAnswer: string;
  topicId: string | null;
  topicLabel: string;
  source: MockSourceRef;
  difficulty: "easy" | "medium" | "hard";
  /** Sayısal: beklenen değer + birim + tolerans. */
  numericExpected?: number | null;
  numericUnit?: string | null;
  numericTolerance?: number | null;
  trueFalseStatement?: string | null;
  correctedStatement?: string | null;
};

export type MockTopicReportRow = {
  topicId: string | null;
  topicLabel: string;
  correct: number;
  total: number;
  pointsEarned: number;
  pointsMax: number;
  percent: number;
  examHeavy: boolean;
};

export type MockGradeItem = {
  questionId: string;
  userAnswer: string | string[];
  isCorrect: boolean;
  pointsEarned: number;
  pointsMax: number;
  verdict: "dogru" | "kismen" | "yanlis" | "bos";
  explanation: string;
  feedback: Record<string, unknown> | null;
  topicId: string | null;
  topicLabel: string;
};

export const DEFAULT_SHORT = {
  questionCount: 10,
  durationMinutes: 20,
} as const;

export const DEFAULT_STANDARD = {
  questionCount: 20,
  durationMinutes: 40,
} as const;

/** Süre dolduktan sonra kabul edilen gecikme (sn). */
export const DEADLINE_GRACE_SEC = 120;

/** Cevap kaydı debounce (ms). */
export const ANSWER_SAVE_DEBOUNCE_MS = 800;

/** Konu üretiminde eşzamanlı üst sınır. */
export const TOPIC_GENERATE_CONCURRENCY = 4;
