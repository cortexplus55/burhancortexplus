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

export async function recordAnswerEvidence(
  service: SupabaseClient,
  input: { userId: string; prepId: string | null; prefs: unknown; source: "deneme" | "konu_testi"; answers: EvidenceAnswer[] },
): Promise<number> {
  let written = 0;
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
        const { data: row } = await service
          .from("outcome_mastery")
          .select("alpha, beta, n")
          .eq("user_id", input.userId)
          .eq("outcome_id", id)
          .maybeSingle();
        const prev = row ? { alpha: Number(row.alpha), beta: Number(row.beta), n: Number(row.n) } : PRIOR;
        const { error } = await service.from("outcome_mastery").upsert(
          {
            user_id: input.userId,
            outcome_id: id,
            unit_id: o.unitId,
            program_id: o.programId,
            alpha: a.correct ? round(prev.alpha + match.weight) : prev.alpha,
            beta: a.correct ? prev.beta : round(prev.beta + match.weight),
            n: prev.n + 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,outcome_id" },
        );
        if (!error) written += 1;
      }
    } catch (error) {
      console.error("exam_evidence_failed", error instanceof Error ? error.message.slice(0, 160) : "unknown");
    }
  }
  return written;
}
