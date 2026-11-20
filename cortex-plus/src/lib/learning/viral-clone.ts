import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashIp } from "@/lib/abuse/record";
import { shareInFlight } from "@/lib/ai/inflight-share";
import { freePrepLimitReached } from "@/lib/billing/free-prep-limit";
import { ensurePathSkeletonNodes, ensurePrepNodes } from "@/lib/learning/exam-prep-insert";
import { readLessonV3 } from "@/lib/learning/lesson-v3";
import { copyInvitedPrep, findJoinedCopy } from "@/lib/learning/prep-invite-store";
import { loadSharedPrep, type SharedPrep } from "@/lib/learning/prep-share-code";

/**
 * Paylaşılan çalışma yolunu öğrencinin hesabına klonlar (Faz 7, 20 Kasım 2026, ürün sahibinin kararı).
 *
 * Model, OCR, ses çağrısı ve kredi ayırması YOK: kopya bütünüyle kayıtlardan kurulur.
 *   1. Hazırlık kabuğu ve konu haritası: sınıf davetinin çatal modeliyle (`copyInvitedPrep`): başlık, sınav türü,
 *      tarihi, hedefi, saati/yeri ve konu başlıkları sırasıyla. Kopya `cloned_from_prep_id` ile kaynağına bağlanır.
 *   2. 1. konunun (1. ünite) paylaşanda önceden üretilmiş dersi (`exam_prep_lessons.content_json`, son kayıt).
 *
 * Kopyalanmayanlar: belge, depolama yolu, kaynak listesi ve konunun belge bağı, cevap, hâkimiyet,
 * yanılgı, yıldız, sonuç ve sohbet. Arkadaşın cevapları ve hâkimiyeti boş başlar.
 *
 * Aynı öğrenci aynı kaynaktan bir kez klonlar: önce eski kopya aranır, kopyalama hazırlık başına kısa kilitle koşar ve
 * veritabanında `exam_preps_clone_once` dizini ikinci kopyayı reddeder (o zaman eski kopya açılır).
 */

export type CloneResult =
  | { ok: true; id: string; status: "created" | "existing" | "owner"; lessonCopied: boolean }
  | { ok: false; reason: "invalid" | "not_found" | "unavailable" | "free_prep_limit" | "save_failed" };

const CLONE_LOCK = { ttlMs: 30_000, waitMs: 10_000 } as const;

export async function cloneSharedPrepForUser(
  service: SupabaseClient,
  input: { shareCode: string; userId: string; ip: string | null },
): Promise<CloneResult> {
  const found = await loadSharedPrep(service, input.shareCode);
  if (!found.ok) return { ok: false, reason: found.reason };
  const source = found.prep;
  // Kendi kodunu açan sahip kendi hazırlığına gider; kendini davet ödül de almaz (SQL de reddeder).
  if (source.userId === input.userId) return { ok: true, id: source.id, status: "owner", lessonCopied: false };

  const existing = await findJoinedCopy(service, { sourceId: source.id, userId: input.userId });
  if (existing) return { ok: true, id: existing, status: "existing", lessonCopied: false };

  return shareInFlight<CloneResult>(
    `prep-clone:${input.userId}:${source.id}`,
    () => createClone(service, { source, userId: input.userId, ipHash: hashIp(input.ip) }),
    async () => {
      const copy = await findJoinedCopy(service, { sourceId: source.id, userId: input.userId });
      return copy ? { ok: true, id: copy, status: "existing", lessonCopied: false } : { ok: false, reason: "save_failed" };
    },
    CLONE_LOCK,
  );
}

async function createClone(
  service: SupabaseClient,
  input: { source: SharedPrep; userId: string; ipHash: string | null },
): Promise<CloneResult> {
  const { source, userId } = input;
  // Kilit alınırken başka sekme kopyayı bitirmiş olabilir.
  const raced = await findJoinedCopy(service, { sourceId: source.id, userId });
  if (raced) return { ok: true, id: raced, status: "existing", lessonCopied: false };
  // Ücretsiz hesapta tek hazırlık kuralı burada da geçerli (sınıf daveti ve okul kopyası gibi).
  if (await freePrepLimitReached(service, userId)) return { ok: false, reason: "free_prep_limit" };

  const copy = await copyInvitedPrep(service, {
    source: {
      id: source.id,
      userId: source.userId,
      title: source.title,
      examType: source.examType,
      examDate: source.examDate,
      targetScore: source.targetScore,
      topicCount: source.topicCount,
      learningPreferences: source.learningPreferences,
    },
    userId,
    clone: { ipHash: input.ipHash },
  });
  if (!copy.ok) {
    if (copy.conflict) {
      const again = await findJoinedCopy(service, { sourceId: source.id, userId });
      if (again) return { ok: true, id: again, status: "existing", lessonCopied: false };
    }
    return { ok: false, reason: "save_failed" };
  }

  const lessonCopied = await copyFirstLesson(service, {
    sourcePrepId: source.id,
    copyPrepId: copy.id,
    userId,
    firstTopicId: copy.firstTopicId,
    examDate: source.examDate,
  }).catch((error: unknown) => {
    console.warn("viral_clone_lesson_skipped", { reason: "error", cause: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return false;
  });
  return { ok: true, id: copy.id, status: "created", lessonCopied };
}

/**
 * 1. konunun hazır dersini arkadaşın hesabına koyar. Seçilen yol: arkadaşın yolundaki ilk ders düğümüne **açık
 * (`active`) bir ders kaydı** yazılır. Düğüm sayfası açık kaydı sunucuda okuyup "sürdür" yanıtıyla anında çizer
 * (`action: "resume"`, `findResumableAttempt`): bu yol salt okumadır; model çağırmaz, kredi ayırmaz ve ücretsiz
 * sayacın hiçbirine düşmez. Önceden yazım tablosu (`exam_prep_prefetch`) bilerek kullanılmadı: o yol açılışta kredi
 * ayırır (`servePrefetched`) ve öğrencinin aşinalık seçimi tutmazsa hazır dersi atıp yeniden yazdırır. Ders ayrıca
 * konunun kayıtlı dersi olarak da yazılır (`exam_prep_lessons`): konu testi, podcast, tekrar kartları ve sınav sabahı
 * kâğıdı dersi oradan okur; açık ders kaydı da konuyu "dersi açılmış" yapar, konu testi ve kartlar ilk dersin
 * döngüsündeki gibi "derse dahil" sayılır. Yani arkadaşın sayacına normal bir ilk dersten fazlası düşmez (azı düşer).
 *
 * Yol düğümleri burada kurulur (sayfa ilk açılışta da aynı işlevlerle kurardı; ikisi de hazırlık başına kilitli ve
 * düğüm varsa yazmaz). Ders yoksa ya da okunamıyorsa kopya ders olmadan kalır; arkadaş dersi bugünkü gibi açar.
 */
async function copyFirstLesson(
  service: SupabaseClient,
  input: { sourcePrepId: string; copyPrepId: string; userId: string; firstTopicId: string | null; examDate: string | null },
): Promise<boolean> {
  if (!input.firstTopicId) return false;
  const { data: sourceTopic } = await service
    .from("exam_prep_topics")
    .select("id")
    .eq("exam_prep_id", input.sourcePrepId)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (!sourceTopic?.id) return false;
  const { data: stored } = await service
    .from("exam_prep_lessons")
    .select("title, content_md, content_json")
    .eq("exam_prep_id", input.sourcePrepId)
    .eq("topic_id", sourceTopic.id as string)
    .not("content_json", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lesson = stored?.content_json ? readLessonV3(stored.content_json) : null;
  if (!stored || !lesson) {
    console.info("viral_clone_lesson_skipped", { reason: stored ? "unreadable" : "no_lesson" });
    return false;
  }

  await ensurePrepNodes(service, { id: input.copyPrepId, exam_date: input.examDate });
  await ensurePathSkeletonNodes(service, input.copyPrepId);
  const { data: lessonNode } = await service
    .from("exam_prep_nodes")
    .select("id")
    .eq("exam_prep_id", input.copyPrepId)
    .eq("kind", "lesson")
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (!lessonNode?.id) {
    console.info("viral_clone_lesson_skipped", { reason: "no_lesson_node" });
    return false;
  }

  const title = String(stored.title ?? lesson.title ?? "").trim() || lesson.title;
  const { error: savedError } = await service.from("exam_prep_lessons").insert({
    exam_prep_id: input.copyPrepId,
    topic_id: input.firstTopicId,
    title,
    content_md: String(stored.content_md ?? "").trim() || title,
    content_json: stored.content_json,
  });
  if (savedError) console.warn("viral_clone_topic_lesson_failed", { code: savedError.code ?? null });

  const payload = {
    type: "lesson",
    lesson: stored.content_json,
    title,
    qualityReport: null,
    refunded: false,
    engine: "teacher",
    // İz: ders paylaşılan yoldan kopyalandı (ekran okumaz).
    clonedLesson: true,
  };
  const now = new Date().toISOString();
  const { error: attemptError } = await service.from("exam_prep_node_attempts").insert({
    node_id: lessonNode.id as string,
    exam_prep_id: input.copyPrepId,
    user_id: input.userId,
    topic_id: input.firstTopicId,
    difficulty: "orta",
    voice_mode: false,
    payload,
    // countTotal("lesson") ile aynı: ders kaydının toplamı 1.
    total: 1,
    status: "active",
    generation_id: crypto.randomUUID(),
    client_request_id: crypto.randomUUID(),
    content_version: 1,
    updated_at: now,
  });
  if (attemptError) {
    console.warn("viral_clone_lesson_attempt_failed", { code: attemptError.code ?? null });
    return false;
  }
  return true;
}
