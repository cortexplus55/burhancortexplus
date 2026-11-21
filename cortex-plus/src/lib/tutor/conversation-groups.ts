import type { SupabaseClient } from "@supabase/supabase-js";
import { missingRelation } from "@/lib/learning/missing-column";
import { NOT_STUDIO_EXAM_FILTER } from "@/lib/learning/studio-exam";

/*
  Sohbet geçmişi hazırlığa göre (Faz 11, teacher.v2, 21 Kasım 2026). Ana sohbet bir hazırlığın bağlamında yürüdüğünde
  (istekte `contextPrepId`, sunucu sahipliği doğrular) konuşma o hazırlığa bağlanır: `tutor_conversation_preps`, konuşma
  başına tek satır, son bağlam geçerli (göç 20261121150000). Geçmiş listesi konuşmaları bu bağla gruplar: her hazırlık
  kendi başlığıyla ve sınav tarihiyle, en yeni konuşması olan önce; sonda "Genel sohbetler".

  Kurallar:
  - Bağı olmayan ya da hazırlığı artık listede olmayan (silinmiş, "Hedef puan" kaydı, Çalışma Stüdyosu'nun geçici deneme
    hazırlığı) konuşma Genel'e düşer. Hazırlık listesi ana ekranın şeridiyle aynı süzgeçten geçer.
  - Bütün okumalar öğrencinin kimliğiyle süzülür (servis anahtarı, tablo tarayıcıya kapalı); kimlikler 150'lik dilimle.
  - Tablo yoksa (göç uygulanmadı) ya da okuma düşerse yükleyici `null` döner: çağıran bugünkü düz listeye düşer.
  - Bağ yazımı asla fırlatmaz; tablo yoksa sessizce atlanır.
  Model çağrısı ve kredi yok. Bu dosya sunucu anahtarı taşımaz; istemci bileşenleri yalnız türlerini ve sabitlerini alır.
*/

export const CONVERSATION_PREPS_TABLE = "tutor_conversation_preps";
export const GENERAL_GROUP_KEY = "genel";
export const GENERAL_GROUP_TITLE = "Genel sohbetler";
/** Hazırlığın adı boşsa (eski kayıt) öbür listelerle aynı yedek ad. */
export const PREP_FALLBACK_TITLE = "Sınav hazırlığı";
/** Kimlikler adres uzunluğu aşılmasın diye bu boyda dilimlerle sorulur. */
export const ID_SLICE = 150;
/** Geçmiş listesinin okuduğu en çok konuşma (/sohbetler ile aynı). */
export const HISTORY_CONVERSATION_LIMIT = 80;

export type GroupConversation = { id: string; title: string | null; updatedAt: string };
export type GroupPrep = { id: string; title: string; examDate: string | null };
export type ConversationPrepLink = { conversationId: string; prepId: string };

export type ConversationGroup = {
  /** Hazırlığın kimliği ya da `GENERAL_GROUP_KEY`. */
  key: string;
  prepId: string | null;
  title: string;
  /** "YYYY-AA-GG"; yoksa null. */
  examDate: string | null;
  /** Güncelliğe göre, en yeni önce. */
  conversations: GroupConversation[];
};

const timeOf = (iso: string | null | undefined): number => {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
};

/** En yeni önce; eşitlikte kimlik sırası (sunucu ve tarayıcı aynı sırayı çizsin). */
function byRecency(a: GroupConversation, b: GroupConversation): number {
  return timeOf(b.updatedAt) - timeOf(a.updatedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function dayOnly(value: string | null | undefined): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/**
 * Saf gruplama. `preps` öğrencinin listede görünen hazırlıklarıdır; bağı bu listede olmayan bir hazırlığa giden konuşma
 * Genel'e düşer. Boş grup çizilmez; Genel grup her zaman en sonda.
 */
export function groupConversations(input: {
  conversations: readonly GroupConversation[];
  links: readonly ConversationPrepLink[];
  preps: readonly GroupPrep[];
}): ConversationGroup[] {
  const prepById = new Map(input.preps.map((prep) => [prep.id, prep]));
  const prepOf = new Map<string, string>();
  for (const link of input.links) {
    if (prepById.has(link.prepId)) prepOf.set(link.conversationId, link.prepId);
  }
  const seen = new Set<string>();
  const buckets = new Map<string, GroupConversation[]>();
  const general: GroupConversation[] = [];
  for (const conversation of input.conversations) {
    if (seen.has(conversation.id)) continue;
    seen.add(conversation.id);
    const prepId = prepOf.get(conversation.id);
    if (!prepId) {
      general.push(conversation);
      continue;
    }
    const list = buckets.get(prepId) ?? [];
    list.push(conversation);
    buckets.set(prepId, list);
  }
  const groups: ConversationGroup[] = [...buckets.entries()].map(([prepId, conversations]) => {
    const prep = prepById.get(prepId)!;
    return {
      key: prepId,
      prepId,
      title: prep.title.trim() || PREP_FALLBACK_TITLE,
      examDate: dayOnly(prep.examDate),
      conversations: [...conversations].sort(byRecency),
    };
  });
  groups.sort(
    (a, b) =>
      timeOf(b.conversations[0]?.updatedAt) - timeOf(a.conversations[0]?.updatedAt) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  if (general.length) {
    groups.push({
      key: GENERAL_GROUP_KEY,
      prepId: null,
      title: GENERAL_GROUP_TITLE,
      examDate: null,
      conversations: [...general].sort(byRecency),
    });
  }
  return groups;
}

/** Bağ okunamadığında (göçsüz) bütün konuşmalar tek Genel grupta. */
export function generalOnly(conversations: readonly GroupConversation[]): ConversationGroup[] {
  return groupConversations({ conversations, links: [], preps: [] });
}

function slices<T>(items: readonly T[], size = ID_SLICE): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

/** Öğrencinin silinmemiş konuşmaları, en yeni önce (/sohbetler'in okumasıyla aynı). Okuma düşerse fırlatır. */
export async function loadConversationList(
  client: SupabaseClient,
  userId: string,
  limit = HISTORY_CONVERSATION_LIMIT,
): Promise<GroupConversation[]> {
  const { data, error } = await client
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("conversation_list_unavailable");
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: (row.title as string | null) ?? null,
    updatedAt: String(row.updated_at ?? ""),
  }));
}

/**
 * Konuşmaları hazırlığa göre gruplar. `service` sunucu anahtarlı istemci; bütün sorgular `userId` ile süzülür.
 * Tablo yoksa ya da bir okuma düşerse `null` (çağıran bugünkü listeye düşer).
 */
export async function loadConversationGroups(
  service: SupabaseClient,
  userId: string,
  conversations: readonly GroupConversation[],
): Promise<ConversationGroup[] | null> {
  const ids = [...new Set(conversations.map((row) => row.id))];
  const links: ConversationPrepLink[] = [];
  for (const slice of slices(ids)) {
    const { data, error } = await service
      .from(CONVERSATION_PREPS_TABLE)
      .select("conversation_id, prep_id")
      .eq("user_id", userId)
      .in("conversation_id", slice);
    if (error) {
      if (!missingRelation(error)) console.warn("tutor_conversation_preps_read_failed", { code: error.code ?? null });
      return null;
    }
    for (const row of data ?? []) {
      links.push({ conversationId: String(row.conversation_id), prepId: String(row.prep_id) });
    }
  }
  const prepIds = [...new Set(links.map((link) => link.prepId))];
  const preps: GroupPrep[] = [];
  for (const slice of slices(prepIds)) {
    const { data, error } = await service
      .from("exam_preps")
      .select("id, title, exam_type, exam_date")
      .eq("user_id", userId)
      .in("id", slice)
      // Ana ekranın şeridi ve öbür hazırlık listeleriyle aynı süzgeç: "Hedef puan" kaydı ve stüdyo denemesi yok.
      .neq("exam_type", "hedef")
      .or(NOT_STUDIO_EXAM_FILTER);
    if (error) {
      console.warn("tutor_history_preps_read_failed", { code: error.code ?? null });
      return null;
    }
    for (const row of data ?? []) {
      preps.push({
        id: String(row.id),
        title: String(row.title ?? row.exam_type ?? "").trim(),
        examDate: (row.exam_date as string | null) ?? null,
      });
    }
  }
  return groupConversations({ conversations, links, preps });
}

/**
 * Konuşmayı hazırlığa bağlar (konuşma başına tek satır, son bağlam geçerli). Yalnız sunucu anahtarıyla ve yalnız
 * sahipliği doğrulanmış hazırlık için çağrılır. Asla fırlatmaz; tablo yoksa sessizce atlanır.
 */
export async function bindConversationPrep(
  service: SupabaseClient,
  input: { userId: string; conversationId: string; prepId: string },
): Promise<"saved" | "skipped" | "failed"> {
  try {
    const { error } = await service.from(CONVERSATION_PREPS_TABLE).upsert(
      {
        conversation_id: input.conversationId,
        user_id: input.userId,
        prep_id: input.prepId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" },
    );
    if (!error) return "saved";
    if (missingRelation(error)) return "skipped";
    console.warn("tutor_conversation_prep_write_failed", { code: error.code ?? null });
    return "failed";
  } catch (error) {
    console.warn("tutor_conversation_prep_write_failed", { cause: error instanceof Error ? error.name : "unknown" });
    return "failed";
  }
}
