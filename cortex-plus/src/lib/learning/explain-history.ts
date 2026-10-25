import type { ExplainReview, ExplainVerdict } from "@/lib/learning/explain-review";

/** Anlatarak öğren denemesi — sunucu satırı veya yerel kopya. */
export type ExplainAttempt = {
  id: string;
  topic: string;
  documentId?: string | null;
  explanation: string;
  verdict: ExplainVerdict;
  summary: string;
  gaps: { point: string; why: string }[];
  missed: string[];
  followUp?: string;
  probe?: string | null;
  createdAt: string;
};

export const EXPLAIN_HISTORY_STORAGE_KEY = "cortex-explain-history-v1";

function fold(text: string): string {
  return text.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}

/** Önceki eksiğin yeni listede (ve anlatımda) kapanıp kapanmadığı. */
export function closedGaps(
  previous: { point: string }[] | null | undefined,
  current: { point: string }[] | null | undefined,
): string[] {
  if (!previous?.length) return [];
  const open = new Set((current ?? []).map((gap) => fold(gap.point)).filter(Boolean));
  const seen = new Set<string>();
  const closed: string[] = [];
  for (const gap of previous) {
    const key = fold(gap.point);
    if (!key || seen.has(key) || open.has(key)) continue;
    // Aynı eksiğin kısaltılmış / uzatılmış hâli hâlâ listedeyse kapanmış sayma.
    const stillOpen = [...open].some((point) => point.includes(key) || key.includes(point));
    if (stillOpen) continue;
    seen.add(key);
    closed.push(gap.point);
  }
  return closed;
}

export function sameExplainTopic(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

export function latestAttemptForTopic(attempts: ExplainAttempt[], topic: string): ExplainAttempt | null {
  const key = fold(topic);
  if (!key) return null;
  return attempts.find((row) => fold(row.topic) === key) ?? null;
}

export function reviewToAttempt(
  input: {
    id?: string;
    topic: string;
    documentId?: string | null;
    explanation: string;
    probe?: string | null;
    createdAt?: string;
  } & ExplainReview,
): ExplainAttempt {
  return {
    id: input.id ?? `local-${Date.now().toString(36)}`,
    topic: input.topic,
    documentId: input.documentId ?? null,
    explanation: input.explanation,
    verdict: input.verdict,
    summary: input.summary,
    gaps: input.gaps ?? [],
    missed: input.missed ?? [],
    followUp: input.followUp,
    probe: input.probe ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function readLocalExplainHistory(): ExplainAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXPLAIN_HISTORY_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAttempt).slice(0, 40);
  } catch {
    return [];
  }
}

export function writeLocalExplainHistory(attempts: ExplainAttempt[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPLAIN_HISTORY_STORAGE_KEY, JSON.stringify(attempts.slice(0, 40)));
  } catch {
    /* kota / gizli kip */
  }
}

export function mergeExplainHistory(server: ExplainAttempt[], local: ExplainAttempt[]): ExplainAttempt[] {
  const seen = new Set<string>();
  const out: ExplainAttempt[] = [];
  for (const row of [...server, ...local]) {
    if (!isAttempt(row) || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 40);
}

function isAttempt(value: unknown): value is ExplainAttempt {
  if (!value || typeof value !== "object") return false;
  const row = value as ExplainAttempt;
  return typeof row.id === "string" && typeof row.topic === "string" && typeof row.verdict === "string";
}
