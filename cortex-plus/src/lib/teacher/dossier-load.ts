import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDay } from "@/lib/istanbul-day";
import { NOT_STUDIO_EXAM_FILTER } from "@/lib/learning/studio-exam";
import { loadStudentMemory } from "@/lib/learning/student-memory/store";
import { getUserStreak } from "@/lib/streak/record-activity";
import { buildDossier, type Dossier, type DossierInput, type DossierPrep } from "@/lib/teacher/dossier";

/*
  Öğrenci Dosyası yükleyicisi (PROMPT-V2 §0, §3; PR-2). Yalnız okur, yalnız öğrencinin kendi satırları (`user_id`
  süzgeci; servis istemcisi, çünkü tekrar kuyruğu ve öğrenme hafızası tablolarında öğrenci politikası yok).

  Disk IO kuralı (§0): her sorgu `user_id` ile başlayan bir indeksle ya da indeksli üst kayıtla (`exam_prep_id`) okunur
  ve `LIMIT`'lidir; vektör araması (belge arama işlevi) çağrılmaz. Sorgular aynı anda; toplam bütçe ≤300 ms. Sonuç sunucu
  belleğinde 10 dk tutulur (aynı seans içindeki her tur yeniden okumaz). Bir kaynak düşerse o satır yok sayılır, dosya
  yine kurulur (öğretmen eksik veriyle iddia kurmaz).
*/

export const DOSSIER_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const PREP_LIMIT = 3;
const NODE_LIMIT = 300;

type CacheEntry = { at: number; value: Dossier };
const cache = new Map<string, CacheEntry>();

export function clearDossierCache(): void {
  cache.clear();
}

async function settle<T>(work: PromiseLike<T>, fallback: T, source: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    console.warn("dossier_source_failed", { source, cause: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return fallback;
  }
}

type Rows<T> = { data: T[] | null; error: unknown };
type Count = { count: number | null; error: unknown };

/** Kaynakları okur ve saf girdiye çevirir (testte yalnız bu sorgu biçimleri sınanır). */
export async function readDossierInput(service: SupabaseClient, userId: string, now = new Date()): Promise<DossierInput> {
  const today = istanbulDay(now);
  const [memory, mistakes, preps, prepDue, generalDue, documents, streak] = await Promise.all([
    settle(loadStudentMemory(service, userId), null, "memory"),
    settle(
      service
        .from("mistake_entries")
        .select("topic_label, wrong_count")
        .eq("user_id", userId)
        .order("wrong_count", { ascending: false })
        .limit(30) as unknown as PromiseLike<Rows<{ topic_label: string | null; wrong_count: number | null }>>,
      { data: [], error: null },
      "mistakes",
    ),
    settle(
      service
        .from("exam_preps")
        .select("id, title, exam_type, exam_date, created_at")
        .eq("user_id", userId)
        .neq("exam_type", "hedef")
        .or(NOT_STUDIO_EXAM_FILTER)
        .order("created_at", { ascending: false })
        .limit(PREP_LIMIT) as unknown as PromiseLike<
        Rows<{ id: string; title: string | null; exam_type: string | null; exam_date: string | null; created_at: string | null }>
      >,
      { data: [], error: null },
      "preps",
    ),
    settle(
      service
        .from("exam_prep_review_items")
        .select("exam_prep_id", { count: "exact" })
        .eq("user_id", userId)
        .eq("status", "active")
        .lte("due_on", today)
        .limit(1) as unknown as PromiseLike<Rows<{ exam_prep_id: string | null }> & Count>,
      { data: [], error: null, count: 0 },
      "prep_reviews",
    ),
    settle(
      service
        .from("general_review_cards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "active")
        .lte("due_on", today) as unknown as PromiseLike<Count>,
      { count: 0, error: null },
      "general_reviews",
    ),
    settle(
      service
        .from("documents")
        .select("id, file_name, page_count")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .is("part_of", null)
        .order("created_at", { ascending: false })
        .limit(3) as unknown as PromiseLike<Rows<{ id: string; file_name: string | null; page_count: number | null }>>,
      { data: [], error: null },
      "documents",
    ),
    // Seri, son etkinlik gününe göre (dünden eski seri bitmiş sayılır): Seri penceresiyle aynı kaynak.
    settle(getUserStreak(service, userId, now), 0, "streak"),
  ]);

  const prepRows = preps.error ? [] : (preps.data ?? []);
  const nodeRows = prepRows.length
    ? await settle(
        service
          .from("exam_prep_nodes")
          .select("id, exam_prep_id, kind, title, status, sort_order, session_meta")
          .in(
            "exam_prep_id",
            prepRows.map((row) => row.id),
          )
          .limit(NODE_LIMIT) as unknown as PromiseLike<
          Rows<{
            id: string;
            exam_prep_id: string;
            kind: string | null;
            title: string | null;
            status: string | null;
            sort_order: number | null;
            session_meta: Record<string, unknown> | null;
          }>
        >,
        { data: [], error: null },
        "nodes",
      )
    : { data: [], error: null };
  const nodes = nodeRows.error ? [] : (nodeRows.data ?? []);

  const prepList: DossierPrep[] = prepRows.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? row.exam_type ?? "Hazırlık"),
    examDate: row.exam_date ? String(row.exam_date).slice(0, 10) : null,
    createdAt: row.created_at ?? null,
    nodes: nodes
      .filter((node) => node.exam_prep_id === row.id)
      .map((node) => ({
        id: String(node.id),
        kind: node.kind,
        title: node.title,
        status: node.status,
        sortOrder: node.sort_order,
        sessionMeta: node.session_meta,
      })),
  }));

  return {
    today,
    mistakes: (mistakes.error ? [] : (mistakes.data ?? [])).map((row) => ({
      topicLabel: row.topic_label,
      wrongCount: Number(row.wrong_count ?? 1),
    })),
    openMisconceptions: (memory?.openMisconceptions ?? []).map((row) => ({ topicLabel: row.topicLabel })),
    preps: prepList,
    dueReviews: {
      prep: prepDue.error ? 0 : Number(prepDue.count ?? 0),
      general: generalDue.error ? 0 : Number(generalDue.count ?? 0),
      prepId: prepDue.error ? null : (prepDue.data?.[0]?.exam_prep_id ?? null),
    },
    documents: (documents.error ? [] : (documents.data ?? [])).map((row) => ({
      id: String(row.id),
      fileName: String(row.file_name ?? "Belge"),
      pageCount: row.page_count,
    })),
    streak: streak > 0 ? streak : null,
  };
}

/** Öğrencinin dosyası; 10 dk önbellekte. `fresh` önbelleği atlar (ör. öğrenci bir kaydı sildikten sonra). */
export async function loadStudentDossier(
  service: SupabaseClient,
  userId: string,
  options: { now?: Date; fresh?: boolean } = {},
): Promise<Dossier> {
  const now = options.now ?? new Date();
  const hit = cache.get(userId);
  if (!options.fresh && hit && now.getTime() - hit.at < DOSSIER_TTL_MS) return hit.value;
  const started = Date.now();
  const value = buildDossier(await readDossierInput(service, userId, now));
  console.info("dossier_loaded", { ms: Date.now() - started, lines: value.lines.length, empty: value.empty });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(userId, { at: now.getTime(), value });
  return value;
}
