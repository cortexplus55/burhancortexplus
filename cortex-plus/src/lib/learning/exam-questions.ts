export type ExamQuestionRow = {
  id: string;
  question_text: string | null;
  options: unknown;
  sort_order: number | null;
};

export function normalizeExamQuestions(rows: ExamQuestionRow[] | null | undefined) {
  return (rows ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((question) => ({
      id: question.id,
      text: question.question_text ?? "",
      options: Array.isArray(question.options)
        ? (question.options as string[])
        : [],
    }))
    .filter((q) => q.text.length > 0);
}
