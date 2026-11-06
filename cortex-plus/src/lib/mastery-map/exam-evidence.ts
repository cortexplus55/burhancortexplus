/**
 * Havuz dışı deneme / konu testi cevaplarını Hakimiyet Haritası'na (outcome_mastery) yazar (3 Kasım 2026).
 * - Konu → resmî ünite: hazırlığın officialPlan'ı (poolSliceForTopic); eşleşmeyen konu atlanır, kazanım uydurulmaz.
 * - Kazanım: soru metni ↔ kazanım metni örtüşmesi; belirsizse ünitenin kazanımlarına eşit pay (1/k).
 * - item_responses'a (karantina kuralı) YAZILMAZ; o tablo yalnız havuz soruları içindir.
 * - Tekillik: exam_answer_evidence (user_id, question_key) benzersiz; önce o satır yazılır, çakışırsa ustalık
 *   ikinci kez güncellenmez. Tablo yoksa sessizce 0 döner; notlama asla düşmez.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRIOR } from "@/lib/level-check/mastery";
import { poolSliceForTopic, sliceOutcomeIds } from "@/lib/content-pool/serve";
import { matchOutcome } from "@/lib/mastery-map/exam-evidence-match";

export type EvidenceAnswer = {
  /** Benzersiz anahtar: deneme için `exam:<soru id>`, konu testi için `node:<attempt id>:<sıra>`. */
  questionKey: string;
  topicLabel: string | null;
  questionText: string;
  correct: boolean;
};

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Bir kazanıma uygulanacak tek artış (`add_outcome_evidence`'ın `p_rows` elemanı). */
export type OutcomeEvidenceRow = {
  outcome_id: string;
  unit_id: string;
  program_id: string;
  weight: number;
  correct: boolean;
};

/** Fonksiyon henüz yok (göçten önce): PostgREST PGRST202 ya da Postgres 42883. */
function rpcMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? "");
}

/** İşlem geri alındı (kısıt ihlali, `23…`): hiçbir satır yazılmadı, satır satır yeniden denemek güvenli. */
function rolledBack(error: { code?: string } | null): boolean {
  return Boolean(error?.code && error.code.startsWith("23"));
}

/** Göçten önceki yol: kazanım başına oku → hesapla → yaz (eşzamanlılıkta artış kaybedebilir). */
async function applyRowByRow(service: SupabaseClient, userId: string, rows: readonly OutcomeEvidenceRow[]): Promise<number> {
  let written = 0;
  for (const r of rows) {
    try {
      const { data: row } = await service
        .from("outcome_mastery")
        .select("alpha, beta, n")
        .eq("user_id", userId)
        .eq("outcome_id", r.outcome_id)
        .maybeSingle();
      const prev = row ? { alpha: Number(row.alpha), beta: Number(row.beta), n: Number(row.n) } : PRIOR;
      const { error } = await service.from("outcome_mastery").upsert(
        {
          user_id: userId,
          outcome_id: r.outcome_id,
          unit_id: r.unit_id,
          program_id: r.program_id,
          alpha: r.correct ? round(prev.alpha + r.weight) : prev.alpha,
          beta: r.correct ? prev.beta : round(prev.beta + r.weight),
          n: prev.n + 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,outcome_id" },
      );
      if (!error) written += 1;
    } catch (error) {
      console.error("exam_evidence_failed", error instanceof Error ? error.message.slice(0, 160) : "unknown");
    }
  }
  return written;
}

/** Artışları tek çağrıda atomik uygular; fonksiyon yoksa satır satır. Dönüş: yazılan kazanım sayısı. */
export async function applyOutcomeEvidence(
  service: SupabaseClient,
  userId: string,
  rows: readonly OutcomeEvidenceRow[],
): Promise<number> {
  if (!rows.length) return 0;
  try {
    const { data, error } = await service.rpc("add_outcome_evidence", { p_user_id: userId, p_rows: rows });
    if (!error) return typeof data === "number" ? data : Number(data ?? 0) || 0;
    if (rpcMissing(error) || rolledBack(error)) return applyRowByRow(service, userId, rows);
    console.error("exam_evidence_failed", String(error.message ?? error.code ?? "rpc").slice(0, 160));
    return 0;
  } catch (error) {
    console.error("exam_evidence_failed", error instanceof Error ? error.message.slice(0, 160) : "unknown");
    return 0;
  }
}

export async function recordAnswerEvidence(
  service: SupabaseClient,
  input: { userId: string; prepId: string | null; prefs: unknown; source: "deneme" | "konu_testi"; answers: EvidenceAnswer[] },
): Promise<number> {
  const rows: OutcomeEvidenceRow[] = [];
  for (const a of input.answers) {
    try {
      const slice = poolSliceForTopic(input.prefs, a.topicLabel);
      if (!slice) continue;
      const scoped = sliceOutcomeIds(slice);
      const outcomes = slice.units.flatMap((u) =>
        u.outcomes
          .filter((o) => !scoped || scoped.has(o.outcomeId))
          .map((o) => ({ outcomeId: o.outcomeId, text: o.text, unitId: u.unitId, programId: u.program.id })),
      );
      const match = matchOutcome(a.questionText, outcomes);
      if (!match) continue;
      const { error: claimError } = await service.from("exam_answer_evidence").insert({
        user_id: input.userId,
        question_key: a.questionKey,
        prep_id: input.prepId,
        source: input.source,
        outcome_ids: match.outcomeIds,
        weight: match.weight,
        correct: a.correct,
        match_kind: match.kind,
      });
      if (claimError) continue; // çakışma (zaten sayıldı) ya da tablo yok
      for (const id of match.outcomeIds) {
        const o = outcomes.find((x) => x.outcomeId === id)!;
        rows.push({ outcome_id: id, unit_id: o.unitId, program_id: o.programId, weight: match.weight, correct: a.correct });
      }
    } catch (error) {
      console.error("exam_evidence_failed", error instanceof Error ? error.message.slice(0, 160) : "unknown");
    }
  }
  // Bütün artışlar tek çağrıda (notlama başına bir kez).
  return applyOutcomeEvidence(service, input.userId, rows);
}
