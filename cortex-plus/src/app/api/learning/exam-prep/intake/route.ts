import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { pickMainTopics } from "@/lib/learning/diagnostic";
import { buildExamPlan, daysUntilExam } from "@/lib/learning/exam-prep-plan";
import { documentTitle } from "@/lib/documents/topic-title";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(24)
    .optional(),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  documentId: z.string().uuid().optional(),
  /** Flag+topic-map check only — no AI / no credits. */
  probeOnly: z.boolean().optional(),
  dailyMinutes: z.number().int().min(5).max(480).optional(),
  studyDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  hardTopics: z.array(z.string().min(1).max(120)).max(24).optional(),
  learningPreferences: z
    .object({
      style: z.enum(["examples", "theory", "mixed"]).optional(),
      pace: z.enum(["slow", "normal", "fast"]).optional(),
      notes: z.string().max(400).optional(),
    })
    .optional(),
});

const draftSchema = z.object({
  reply: z.string().min(8).max(600),
  title: z.string().min(2).max(120),
  examType: z.string().min(2).max(40),
  topics: z.array(z.string().min(1).max(80)).max(16),
  needDate: z.boolean(),
  ready: z.boolean(),
});

async function resolveTopicSuggestions(
  service: SupabaseClient,
  userId: string,
  documentId: string | undefined,
  v2: boolean,
) {
  let topicSuggestions: { id: string; title: string }[] = [];
  let intakeMode: "legacy" | "v2" = "legacy";
  if (!v2 || !documentId) return { topicSuggestions, intakeMode };

  const { data: doc } = await service
    .from("documents")
    .select("id, topic_map_status")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (doc?.topic_map_status === "ready" || doc?.topic_map_status === "reviewed") {
    const { data: nodes } = await service
      .from("document_topic_nodes")
      .select("id, title, parent_id, sort_order")
      .eq("document_id", doc.id)
      .order("sort_order");
    const mains = pickMainTopics(
      (nodes ?? []).map((n) => ({
        id: n.id as string,
        title: n.title as string,
        parentId: (n.parent_id as string | null) ?? null,
      })),
    );
    topicSuggestions = mains.map((n) => ({ id: n.id, title: n.title }));
    if (topicSuggestions.length) intakeMode = "v2";
  }
  return { topicSuggestions, intakeMode };
}

/**
 * Belgenin adı — kapak başlığı, konu başlıklarının ortak kısmı ya da
 * dosya adı. Model çağrısı yok; bu uç kredi harcamıyor.
 */
async function probeDocumentTitle(
  service: SupabaseClient,
  userId: string,
  documentId: string | undefined,
  topicTitles: string[],
): Promise<string> {
  if (!documentId) return "";
  const [{ data: doc }, { data: pages }] = await Promise.all([
    service
      .from("documents")
      .select("file_name")
      .eq("id", documentId)
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("document_pages")
      .select("page_number, headings")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .limit(2),
  ]);
  return documentTitle({
    coverHeadings: (pages ?? []).flatMap(
      (page) => (page.headings as string[] | null) ?? [],
    ),
    topicTitles,
    fileName: (doc?.file_name as string | null) ?? null,
  });
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-intake", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const v2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);
  const { topicSuggestions, intakeMode } = await resolveTopicSuggestions(
    service,
    userId,
    parsed.data.documentId,
    v2,
  );

  if (parsed.data.probeOnly) {
    return NextResponse.json({
      ok: true,
      intakeMode,
      topicSuggestions,
      draft: topicSuggestions.length
        ? {
            // Hazırlığın adı belgeden gelir; boş kalırsa sihirbaz
            // "${ders} sınav hazırlığı" diyordu ve aynı dersten yüklenen
            // her belge aynı adı taşıyordu.
            title: await probeDocumentTitle(
              service,
              userId,
              parsed.data.documentId,
              topicSuggestions.map((t) => t.title),
            ),
            examType: "Serbest",
            topics: topicSuggestions.map((t) => t.title).slice(0, 16),
          }
        : null,
    });
  }

  if (!parsed.data.messages?.length) return errorResponse(400, "invalid_input");

  const transcript = parsed.data.messages
    .map((message) => `${message.role === "user" ? "Öğrenci" : "Eğitmen"}: ${message.content}`)
    .join("\n");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'JSON: {"reply":string,"title":string,"examType":string,"topics":string[],"needDate":boolean,"ready":boolean}. examType: LGS, TYT, AYT, TUS, Okul veya Serbest. Konular kısa başlık. ready true yalnızca en az 3 konu netse. needDate true konu listesi hazır ama tarih yoksa.',
    userPrompt: `Sınav hazırlığı sohbeti. Öğrencinin yazdıklarından sınavı ve konuları çıkar.
Tarih henüz yoksa konuları netleştirip tarihi iste.
${topicSuggestions.length ? `Belge konu haritası (öncelikli konu listesi): ${topicSuggestions.map((t) => t.title).join(", ")}. Mümkünse topics olarak bunları kullan.` : ""}
${transcript}`,
    parse: (raw) => {
      const result = draftSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const draft = outcome.data;
  if (intakeMode === "v2" && topicSuggestions.length) {
    draft.topics = topicSuggestions.map((t) => t.title).slice(0, 16);
  }

  const examDate = parsed.data.examDate;
  const ready = Boolean(examDate) && draft.topics.length >= 1;
  const days = examDate ? daysUntilExam(examDate) : null;

  return NextResponse.json({
    ok: true,
    reply: examDate
      ? `${days} günlük yolunu hazırladım. Konuları kontrol et, planı başlat.`
      : draft.reply,
    draft: {
      title: draft.title,
      examType: draft.examType,
      topics: draft.topics,
    },
    needDate: !examDate && (draft.needDate || draft.topics.length >= 2),
    ready,
    days,
    preview: days ? buildExamPlan(days) : [],
    intakeMode,
    topicSuggestions,
    profile: {
      dailyMinutes: parsed.data.dailyMinutes ?? null,
      studyDays: parsed.data.studyDays ?? [],
      hardTopics: parsed.data.hardTopics ?? [],
      learningPreferences: parsed.data.learningPreferences ?? {},
    },
  });
}
