import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingColumn } from "@/lib/learning/missing-column";
import { judgeEquivalence } from "@/lib/learning/claim-equivalence";
import {
  applyEquivalenceVerdicts,
  assignContradictions,
  type ContradictionDocument,
  type TopicContradiction,
} from "@/lib/learning/source-contradictions";
import { parseTeacherAnalysis } from "@/lib/learning/teacher-brain";

/**
 * Saklı öğretmen analizinden çelişki okur. Analiz yeniden üretilmez.
 * Tablo ya da kolon yoksa boş döner; hazırlık yine açılır.
 */
export async function readContradictionDocuments(
  service: SupabaseClient,
  documentIds: string[],
): Promise<ContradictionDocument[]> {
  if (!documentIds.length) return [];
  const [{ data: docs, error: docError }, { data: analyses, error: analysisError }] =
    await Promise.all([
      service.from("documents").select("id, file_name").in("id", documentIds),
      service
        .from("document_teacher_analyses")
        .select("document_id, status, analysis")
        .in("document_id", documentIds),
    ]);
  if (docError && missingColumn(docError)) return [];
  if (analysisError) return [];
  const names = new Map(
    (docs ?? []).map((row) => [row.id as string, (row.file_name as string) || "Dosya"]),
  );
  const out: ContradictionDocument[] = [];
  for (const row of analyses ?? []) {
    if (row.status !== "ready") continue;
    const analysis = parseTeacherAnalysis(row.analysis);
    if (!analysis) continue;
    const documentId = row.document_id as string;
    out.push({
      documentId,
      fileName: names.get(documentId) ?? "Dosya",
      definitions: analysis.examFocus.keyDefinitions,
      formulas: analysis.examFocus.keyFormulas,
    });
  }
  return out;
}

export function contradictionsByTopicTitle(
  topics: { title: string; sources: { documentId: string; pages: number[] }[] }[],
  documents: ContradictionDocument[],
): Map<string, TopicContradiction[]> {
  return assignContradictions(topics, documents).byTitle;
}

/**
 * Kesin çelişkiler durur. Adaylar yalnızca model "bağdaşmıyor" derse yazılır.
 * Model yoksa veya emin değilse aday gösterilmez.
 */
export async function contradictionsByTopicTitleResolved(
  service: SupabaseClient,
  userId: string,
  topics: { title: string; sources: { documentId: string; pages: number[] }[] }[],
  documents: ContradictionDocument[],
): Promise<Map<string, TopicContradiction[]>> {
  const assignment = assignContradictions(topics, documents);
  if (!assignment.candidates.length) return assignment.byTitle;
  const verdicts = await judgeEquivalence(service, userId, assignment.candidates);
  return applyEquivalenceVerdicts(assignment, verdicts).byTitle;
}
