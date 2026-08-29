export type ExamAnalysisPayload = {
  summary: string;
  weakTopics: string[];
  nextSteps: string[];
};

export function parseExamAnalysis(raw: string | null | undefined): ExamAnalysisPayload {
  if (!raw?.trim()) {
    return { summary: "", weakTopics: [], nextSteps: [] };
  }
  try {
    const parsed = JSON.parse(raw) as ExamAnalysisPayload;
    if (typeof parsed.summary === "string") {
      return {
        summary: parsed.summary,
        weakTopics: Array.isArray(parsed.weakTopics) ? parsed.weakTopics : [],
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      };
    }
  } catch {
    /* legacy plain text */
  }
  return { summary: raw, weakTopics: [], nextSteps: [] };
}

export function formatExamAnalysisText(payload: ExamAnalysisPayload): string {
  const weak = payload.weakTopics.length ? payload.weakTopics.join(", ") : "—";
  const next = payload.nextSteps.length ? payload.nextSteps.join(", ") : "—";
  return `${payload.summary}\n\nEksik konular: ${weak}\n\nSonraki adımlar: ${next}`;
}
