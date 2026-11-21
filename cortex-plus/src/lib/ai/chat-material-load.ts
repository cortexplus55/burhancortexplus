import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDay } from "@/lib/istanbul-day";
import { NOT_STUDIO_EXAM_FILTER } from "@/lib/learning/studio-exam";
import { loadPrepDocumentIds } from "@/lib/documents/teacher-analysis-run";
import type { StudyNodeRef } from "@/lib/learning/study-tools";
import {
  buildChatActions,
  detectChatIntent,
  matchChatMaterial,
  type ChatAction,
  type ChatIntent,
  type ChatMaterialIndex,
  type ChatMaterialMatch,
} from "@/lib/ai/chat-material-link";

/**
 * Ana sohbetin öğrencinin materyaline bağlanması: sunucu tarafı okumalar (15 Kasım 2026). Yalnız okuma, model çağrısı
 * yok. Bütün sorgular öğrencinin kendi kimliğiyle süzülür (servis anahtarı); istemciden gelen hazırlık kimliği yalnız
 * bu listede varsa kullanılır. Okuma düşerse bağlantı yok (sohbet bugünkü gibi sürer).
 */

const PREP_LIMIT = 20;
const DOCUMENT_LIMIT = 60;

function daysUntil(examDate: string | null, today: string): number | null {
  if (!examDate) return null;
  return Math.round((Date.parse(`${examDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export async function loadChatMaterialIndex(service: SupabaseClient, userId: string): Promise<ChatMaterialIndex> {
  const [{ data: preps, error: prepError }, { data: docs }] = await Promise.all([
    service
      .from("exam_preps")
      .select("id, title, exam_type, exam_date, created_at")
      .eq("user_id", userId)
      .neq("exam_type", "hedef")
      .or(NOT_STUDIO_EXAM_FILTER)
      .order("created_at", { ascending: false })
      .limit(PREP_LIMIT),
    service
      .from("documents")
      .select("id, file_name, part_of")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(DOCUMENT_LIMIT),
  ]);
  if (prepError) throw new Error("material_index_unavailable");
  const ids = (preps ?? []).map((row) => String(row.id));
  const { data: topics } = ids.length
    ? await service
        .from("exam_prep_topics")
        .select("id, exam_prep_id, label, sort_order, document_topic_node_id")
        .in("exam_prep_id", ids)
        .order("sort_order")
        .limit(600)
    : { data: [] as Record<string, unknown>[] };
  const today = istanbulDay();
  return {
    preps: (preps ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      subject: typeof row.exam_type === "string" && row.exam_type !== "hedef" ? row.exam_type : null,
      daysLeft: daysUntil((row.exam_date as string | null) ?? null, today),
      topics: (topics ?? [])
        .filter((topic) => String(topic.exam_prep_id) === String(row.id))
        .map((topic) => ({
          id: String(topic.id),
          label: String(topic.label ?? ""),
          documentTopicNodeId: (topic.document_topic_node_id as string | null) ?? null,
        })),
    })),
    documents: (docs ?? [])
      // Pencere / baş kopyaları ana belgenin parçası: adı aynı, ayrı belge değil.
      .filter((row) => !row.part_of)
      .map((row) => ({ id: String(row.id), name: String(row.file_name ?? "") })),
  };
}

export type ChatMaterialLink = {
  match: ChatMaterialMatch;
  intent: ChatIntent;
  /** Belge araması yapılacak belgeler (eşleşen hazırlıkların ve adı geçen belgelerin). */
  documentIds: string[];
  /** Hazırlık eşleşmedi ama öğrenci kendi notundan söz ediyor: bütün belgelerinde ara. */
  searchAll: boolean;
  actions: ChatAction[];
  /**
   * İstekteki seçili hazırlık öğrencinin kendi listesindeyse onun kimliği, değilse null (Faz 11: sohbet geçmişi bu
   * konuşmayı o hazırlığa bağlar). Mesaj başka bir hazırlığı ansa da seçili hazırlığın sahipliği burada okunur.
   */
  ownedContextPrepId: string | null;
};

/**
 * Seçili hazırlık (ana ekran) tek başına belge araması açmaz: öğrenci materyalinden söz etmiyor, özet ya da araç istemiyor
 * ve hazırlığın bir konusunu anmıyorsa yalnız hazırlık satırı girer. Her ana ekran mesajına arama + belge denetimi
 * eklemek sohbetin tek çağrı kuralını (24 Ekim 2026) gereksiz yere bozardı.
 */
export async function resolveChatMaterial(
  service: SupabaseClient,
  userId: string,
  message: string,
  contextPrepId: string | null,
  options: { conversationId?: string | null } = {},
): Promise<ChatMaterialLink | null> {
  const index = await loadChatMaterialIndex(service, userId);
  if (!index.preps.length && !index.documents.length) return null;
  const ownedContextPrepId = contextPrepId && index.preps.some((prep) => prep.id === contextPrepId) ? contextPrepId : null;
  let match = matchChatMaterial(message, index, { contextPrepId });
  // "Bu konudan test hazırla" (15 Kasım 2026, canlı): mesajda ad yoksa konuşmanın son öğrenci mesajlarında adı geçen
  // hazırlık geçerli; seçili hazırlık ancak onlarda da ad yoksa.
  if (match.reason !== "named" && match.reason !== "days" && options.conversationId) {
    const { data: recent } = await service
      .from("messages")
      .select("content")
      .eq("conversation_id", options.conversationId)
      .eq("user_id", userId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(3);
    for (const row of recent ?? []) {
      const earlier = matchChatMaterial(String(row.content ?? ""), index);
      if (earlier.reason === "named" || earlier.reason === "days") {
        match = { ...earlier, materialCue: match.materialCue || earlier.materialCue };
        break;
      }
    }
  }
  const intent = detectChatIntent(message);
  if (match.reason === "none" && !match.materialCue && !intent.tool && !intent.summary) return null;

  const wantsSearch =
    match.reason === "named" ||
    match.reason === "days" ||
    match.materialCue ||
    intent.summary ||
    Boolean(intent.tool) ||
    match.preps.some((item) => item.topic);
  const prepDocs = wantsSearch
    ? (await Promise.all(match.preps.map((item) => loadPrepDocumentIds(service, item.prep.id).catch(() => [] as string[])))).flat()
    : [];
  const documentIds = [...new Set([...match.documents.map((doc) => doc.id), ...prepDocs])].slice(0, 12);

  const needsNodes = (intent.summary || Boolean(intent.tool)) && match.preps.length > 0;
  const nodesByPrep = new Map<string, StudyNodeRef[]>();
  if (needsNodes) {
    const { data: nodes } = await service
      .from("exam_prep_nodes")
      .select("id, exam_prep_id, kind, status, sort_order, session_meta")
      .in("exam_prep_id", match.preps.map((item) => item.prep.id));
    for (const row of nodes ?? []) {
      const key = String(row.exam_prep_id);
      const list = nodesByPrep.get(key) ?? [];
      list.push({
        id: String(row.id),
        kind: String(row.kind ?? ""),
        status: String(row.status ?? "locked"),
        sortOrder: Number(row.sort_order ?? 0),
        sessionMeta: (row.session_meta as StudyNodeRef["sessionMeta"]) ?? null,
      });
      nodesByPrep.set(key, list);
    }
  }
  return {
    match,
    intent,
    documentIds,
    searchAll: wantsSearch && !documentIds.length && match.materialCue,
    actions: buildChatActions({ intent, match, nodesByPrep }),
    ownedContextPrepId,
  };
}
