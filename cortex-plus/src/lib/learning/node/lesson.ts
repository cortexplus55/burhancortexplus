/** Ders: öğretmen ders motoru, bölüm omurgası ve sıradaki konular. */
import "server-only";
import { after } from "next/server";
import { studentOptionCount } from "@/lib/learning/student-pedagogy";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { corePageRun } from "@/lib/learning/core-pages";
import { runTeacherLesson, type PublishedLesson } from "@/lib/learning/teacher-lesson-run";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordLessonGenerationFailure } from "@/lib/learning/lesson-generation-failures";
import { sessionSignalsPrompt } from "@/lib/learning/session-signals";
import { teachingActivityForKind } from "@/lib/learning/teaching-standards";
import { sectionHeadings } from "@/lib/documents/topic-title";
import { upcomingTopicsAfter } from "@/lib/learning/lesson-grounding";
import { examPointsInSource } from "@/lib/learning/exam-points";
import { NodeGenerationError, actionForKind } from "./shared";
import { saveTopicLesson } from "./lesson-store";
import { withSupport, type LessonCore } from "./teacher-pages";
import type { NodePayloadInput } from "./generate";

/**
 * Dersin bölüm omurgası: kaynağın o sayfalardaki kendi alt başlıkları.
 *
 * Okunamazsa boş dönüyor ve bölümleri model seçmeye devam ediyor —
 * omurga bir iyileştirme, üretimin ön koşulu değil.
 */
export async function loadSectionBackbone(
  service: SupabaseClient,
  input: { documentId: string | null; pageNumbers: number[] | undefined },
): Promise<string[]> {
  if (!input.documentId || !input.pageNumbers?.length) return [];
  const { data } = await service
    .from("document_pages")
    .select("page_number, headings")
    .eq("document_id", input.documentId)
    .in("page_number", input.pageNumbers)
    .order("page_number", { ascending: true });
  if (!data?.length) return [];
  return sectionHeadings(
    data.map((page) => ({ headings: (page.headings as string[]) ?? [] })),
  );
}

/** Konu sırasında bu başlıktan sonrakiler. Eşleşme yoksa null; son konuysa boş dizi. */
export async function loadUpcomingTopicTitles(
  service: SupabaseClient,
  prepId: string,
  currentLabel: string,
): Promise<string[] | null> {
  const { data, error } = await service
    .from("exam_prep_topics")
    .select("label, sort_order")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  if (error || !data) return null;
  return upcomingTopicsAfter(
    currentLabel,
    data.map((row) => String(row.label ?? "")),
  );
}

/**
 * Öğretmen motoru (2 Ekim 2026): temiz sayfalar → tek öğretmen istemi →
 * belgeyle eşleme → modelin düzeltmesi. Kod ders metnine bir şey eklemez.
 * Kredi motorun içinde ayrılır ve sonuçlanır.
 */
export async function teacherLessonPayload(
  input: NodePayloadInput,
  activity: ReturnType<typeof teachingActivityForKind>,
  /** null: belgesiz hazırlık; ders doğruluk kuralıyla yazılır. */
  core: LessonCore | null,
) {
  const startedAt = Date.now();
  const edges = core ? await documentRunningHeaders(input.service, core.documentId) : [];
  const headersMs = Date.now() - startedAt;
  const clean = core
    ? await ensureCleanPages(input.service, {
        userId: input.userId,
        documentId: core.documentId,
        pages: corePageRun(core.pages),
        edges,
      })
    : [];
  // Motor öncesi: sayfa kenarı satırları + temiz sayfa (model temizliği gerekirse burada ödenir).
  console.info("lesson_pre_timing", {
    headersMs,
    cleanMs: Date.now() - startedAt - headersMs,
    pages: clean.length,
    cleanedByModelNow: clean.filter((item) => item.cleaned).length,
  });
  const lessonPages = withSupport(clean, core);
  const outcome = await runTeacherLesson(input.service, {
    mode: core ? "document" : "topic",
    userId: input.userId,
    actionCode: actionForKind(input.kind),
    idempotencyKey: input.idempotencyKey ?? `lesson:${input.prepId ?? "x"}:${input.topicLabel}:${Date.now()}`,
    freeMeter: input.freeMeter,
    // Kavram birimli konuda ders birimi anlatır: "Hukukun Temel Kavramları: Hükümsüzlüğün dereceleri".
    topicLabel: input.sessionMeta?.unitTitle ? `${input.topicLabel}: ${input.sessionMeta.unitTitle}` : input.topicLabel,
    prepTitle: input.prepTitle,
    pages: lessonPages,
    // Ders içi sorunun şık sayısı testle aynı kuraldan (29 Ekim 2026): ortaokul/LGS 4, lise ve üstü 5.
    optionCount: await studentOptionCount(input.service, input.userId, input.prepTitle),
    upcomingTopics: Array.isArray(input.upcomingTopics) ? input.upcomingTopics : [],
    learnerLine: sessionSignalsPrompt(input.familiarity, input.mood),
    // Belgeli derste yalnız dersin kaynağında geçen maddeler: başka belgenin maddesi "kaynakta yok" turu açıyordu.
    examPoints: core ? examPointsInSource(input.examPoints, lessonPages.map((page) => page.text).join("\n")) : input.examPoints,
    runningHeaders: edges,
    startedAt,
    charge: input.charge,
    // Hızlı işlem yalnız öğrencinin açtığı soğuk derste (kimin alacağına `fastAllowedFor` karar verir).
    // Önceden yazım ve ısınma normal işlemde (23 Ekim 2026, ürün sahibinin kararı): ısınma açılmayan
    // derste de ödeniyordu ve hızlı işlem iki kat fiyat; kartlarda geçen süre yazıma yine kazandırılır.
    // İstisna (30 Ekim 2026, tam yetkiyle): yeni kurulan hazırlığın İLK dersi. Öğrenci kurulumdan hemen sonra
    // açıyor; canlıda normal işlemdeki yazım yetişmedi, ilk ekran 24,5 sn bekledi. Hızlı işlemi yine
    // `fastAllowedFor` verir (yalnız Plus/Sigma ve kurucu); ücretsizde değişiklik yok.
    fast: input.charge !== false || input.firstLesson === true,
    onPublish: input.onLessonPublish
      ? (published: PublishedLesson) =>
          input.onLessonPublish!({
            type: "lesson",
            lesson: published.lesson,
            title: published.lesson.title,
            teachingStandard: activity,
            qualityReport: null,
            refunded: false,
            engine: "teacher",
            // Giriş kartı planı: henüz yayımlanmamış kavramların yalnız adları.
            upcoming: published.upcoming,
            // Sayacın paydası: yazarın ekran planı (28 Ekim 2026).
            ...(published.plannedScreens ? { plannedScreens: published.plannedScreens } : {}),
          })
      : undefined,
  });
  // Okunamayan taslak (17 Ekim 2026: 486 jetonluk bir cevap 40 sn yedi, nedeni hiçbir yerde
  // yoktu). Ders yeniden yazıldıysa da kayda geçer.
  if (outcome.draftNote) {
    await recordLessonGenerationFailure(input.service, {
      userId: input.userId,
      prepId: input.prepId ?? null,
      topicId: input.topicId ?? null,
      topicLabel: input.topicLabel,
      kind: "lesson",
      stage: "draft",
      reason: "draft_unreadable",
      reasons: [outcome.draftNote.slice(0, 400)],
    });
  }
  if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error, outcome.reasons);
  if (outcome.dropped.length) {
    await recordLessonGenerationFailure(input.service, {
      userId: input.userId,
      prepId: input.prepId ?? null,
      topicId: input.topicId ?? null,
      topicLabel: input.topicLabel,
      kind: "lesson",
      stage: "concept",
      reason: "concept_dropped",
      reasons: outcome.dropped.map((concept) => `düzelmeyen kavram atıldı: ${concept}`.slice(0, 200)),
    });
  }
  // Düzeltme turu açan ders yavaş (16 Ekim 2026: ~4,5 dk). Nedeni yönetim "Ders hataları"nda
  // görünsün; ölçmeden kural değiştirmeyelim. Ders öğrenciye gider, bu yalnız kayıt.
  if (outcome.fixTriggers.length) {
    await recordLessonGenerationFailure(input.service, {
      userId: input.userId,
      prepId: input.prepId ?? null,
      topicId: input.topicId ?? null,
      topicLabel: input.topicLabel,
      kind: "lesson",
      stage: "fix_rounds",
      reason: "slow_generation",
      reasons: [
        `${Math.round(outcome.ms / 1000)} sn · ${outcome.calls} çağrı · ${outcome.fixTriggers.length} tur`,
        ...outcome.fixTriggers.flatMap((issues, round) =>
          issues.slice(0, 4).map((issue) => `tur ${round + 1} · ${issue.where}: ${issue.problem}`.slice(0, 200)),
        ),
      ],
    });
  }
  const lesson = outcome.lesson;
  // Ders kalitesi örneği (23 Ekim 2026): denetçinin öğretim puanları, ek model çağrısı olmadan. Yanıtı beklemez;
  // tablo yoksa (göçten önce) sessizce atlanır.
  if (outcome.teachingScores?.length) {
    const scores = outcome.teachingScores;
    after(async () => {
      try {
        await input.service.from("lesson_quality_samples").insert({
          source: "verifier",
          user_id: input.userId,
          exam_prep_id: input.prepId ?? null,
          topic_label: input.topicLabel.slice(0, 200),
          scores: { parts: scores },
          total: Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10,
          note: outcome.dropped.length ? `atılan kavram: ${outcome.dropped.length}` : null,
        });
      } catch {
        /* kalite örneği isteğe bağlı */
      }
    });
  }
  const payload = {
    type: "lesson",
    lesson,
    title: lesson.title,
    teachingStandard: activity,
    qualityReport: null,
    refunded: false,
    engine: "teacher",
  };
  // Önceden yazılan ders konuya öğrenci açınca yazılır.
  if (input.prepId && input.topicId && input.charge !== false) {
    await saveTopicLesson(input.service, { prepId: input.prepId, topicId: input.topicId, payload });
    input.onLessonSaved?.(input.topicId);
  }
  return payload;
}
