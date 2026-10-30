import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { recordLearningTrackingAfterComplete } from "@/lib/learning/learning-tracking-persist";
import type { MockGradeItem } from "@/lib/learning/mock-exam";
import { mockNodePayload, mockNodeRequestId } from "@/lib/learning/mock-exam/prep-node-link";
import { awardStars } from "@/lib/stars/award";
import { prepStars } from "@/lib/stars/rules";

/**
 * Notlanan yazılı deneme hazırlığın yoluna yazılır (20 Ekim 2026).
 *
 * Düğüm sayfası "Yazılı deneme"yi deneme kurulumuna gönderiyor; notlandırma yalnız
 * `practice_exam_*` tablolarına yazıyordu. Düğüm hiç bitmiyor, sonrasındaki "Kartlarla son tekrar",
 * "Son kontrol" ve "Hazırsın" sırayla hiç açılmıyor, hazırlık tahmini denemeyi hiç görmüyordu.
 * Şimdi tam deneme (`scope = 'all'`) düğümü tamamlar: aynı tamamlama işlevi (sıradakini açar),
 * deneme puanı düğüm kaydına yüzde olarak, her soru kendi konusuna kanıt olarak yazılır.
 *
 * Yol oraya gelmeden (düğüm kilitliyken) çözülen deneme düğümü TAMAMLAMAZ, yalnız konu kanıtı yazar (30 Ekim
 * 2026, Paket I #8; 20 Ekim'deki "erken çözülen deneme de tamamlar" kararının yerine). Öğrencinin seçip açtığı
 * ya da sırası gelmiş (ready) düğüm kendi oturumudur, tamamlanır. Deneme yanlışları yanılgı satırı olmaz (v1).
 *
 * Çağıran, takvimi yeniden kurmadan ÖNCE çağırır: bitmiş düğüm yeniden kurulumda korunur;
 * önce kurulum koşsaydı başlanmış deneme düğümü silinip yeniden yazılırdı.
 */
export async function writeBackMockToPrep(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string | null;
    scope: string | null;
    practiceExamId: string;
    practiceAttemptId: string;
    scorePct: number;
    items: readonly MockGradeItem[];
  },
): Promise<{ nodeId: string; stars?: number } | null> {
  // Hazırlıksız deneme, konu seçili deneme: yol değişmez. Eski kayıtta kapsam boş = tam deneme.
  if (!input.prepId) return null;
  if (input.scope != null && input.scope !== "all") return null;
  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) return null;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, target_score")
    .eq("id", input.prepId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!prep) return null;

  // Araçlar'ın geçici deneme hazırlığında (exam_type 'deneme') düğüm yok: hiçbir şey yazılmaz.
  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id, status")
    .eq("exam_prep_id", input.prepId)
    .eq("kind", "written_exam")
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (!node?.id) return null;
  const nodeId = node.id as string;

  const payload = mockNodePayload({
    practiceExamId: input.practiceExamId,
    practiceAttemptId: input.practiceAttemptId,
    items: input.items,
  });

  // Adım ancak kendi oturumu bitince tamamlanır (30 Ekim 2026, Paket I #8; 20 Ekim'deki "erken çözülen deneme de
  // düğümü tamamlar" kararı değişti). Kilitli düğüm = yol oraya gelmedi ve öğrenci adımı seçip açmadı (açtıysa
  // düğüm sayfası ya da "choose" onu ready yapar). Canlıda yol oraya gelmeden çözülen bir deneme "Yazılı deneme"
  // adımını %35 ile bitmiş gösterdi. Konu kanıtı kaybolmaz: her soru kendi konusuna yazılır, düğüm açık kalır.
  if (node.status === "locked") {
    await recordLearningTrackingAfterComplete(service, {
      userId: input.userId,
      prepId: input.prepId,
      nodeId: null,
      attemptId: null,
      kind: "written_exam",
      payload,
      answers: {},
      topicLabel: null,
      sessionObjective: null,
      targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
    }).catch(() => undefined);
    return null;
  }

  // Anahtar denemenin kendisi (22 Ekim 2026 inceleme): aynı deneme ikinci kez notlanırsa yeni kayıt kimliği
  // benzersiz dizini geçiyor, düğüm iki kez bitiyordu. Notlandırma zaten yinelenmez; bu ikinci emniyet.
  const requestId = mockNodeRequestId(input.practiceExamId);
  let attempt: { id: string; status: string } | null = null;
  const { data: created, error: insertError } = await service
    .from("exam_prep_node_attempts")
    .insert({
      node_id: nodeId,
      exam_prep_id: input.prepId,
      user_id: input.userId,
      topic_id: null,
      payload,
      total: 100,
      status: "active",
      client_request_id: requestId,
      practice_exam_id: input.practiceExamId,
    })
    .select("id, status")
    .single();
  if (created?.id) {
    attempt = { id: created.id as string, status: String(created.status ?? "active") };
  } else if (insertError) {
    // Aynı notlandırma ikinci kez geldi (benzersiz istek anahtarı): var olan kayıt.
    const { data: existing } = await service
      .from("exam_prep_node_attempts")
      .select("id, status")
      .eq("user_id", input.userId)
      .eq("node_id", nodeId)
      .eq("client_request_id", requestId)
      .maybeSingle();
    if (existing?.id) attempt = { id: existing.id as string, status: String(existing.status ?? "") };
  }
  if (!attempt) return null;
  if (attempt.status === "completed") return { nodeId };

  const score = Math.max(0, Math.min(100, Math.round(input.scorePct)));
  const { error: completeError } = await service.rpc("complete_exam_prep_node", {
    p_user_id: input.userId,
    p_prep_id: input.prepId,
    p_node_id: nodeId,
    p_attempt_id: attempt.id,
    p_score: score,
    p_total: 100,
    p_answers: {},
  });
  if (completeError) return null;

  await recordLearningTrackingAfterComplete(service, {
    userId: input.userId,
    prepId: input.prepId,
    nodeId,
    attemptId: attempt.id,
    kind: "written_exam",
    payload,
    answers: {},
    topicLabel: null,
    sessionObjective: null,
    targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
  }).catch(() => undefined);

  // Yazılı deneme yıldızı (25 Ekim 2026, P1-7): yoldaki öbür adımlar gibi, doğru sayısıyla (yüzde değil).
  const stars = await awardStars(service, {
    userId: input.userId,
    source: "prep",
    ref: `attempt:${attempt.id}`,
    amount: writtenExamStars(input.items),
  });

  return { nodeId, stars };
}

/** Deneme formülü doğru sayısını okur; kısmi puanlı açık uçlu soru doğru sayılmaz. */
export function writtenExamStars(items: readonly MockGradeItem[]): number {
  const correct = items.filter((item) => item.isCorrect).length;
  return prepStars("written_exam", correct, items.length);
}
