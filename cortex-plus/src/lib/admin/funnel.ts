import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_EXAM_TYPE } from "@/lib/learning/studio-exam";
import { PARENT_PAYMENT_VIAS } from "@/lib/admin/cockpit-math";
import {
  firstTopicIdsByPrep,
  firstUnitLessonNodeIds,
  funnelWindows,
  growthFunnel,
  type FunnelAttempt,
  type FunnelNode,
  type FunnelPayment,
  type FunnelPlan,
  type FunnelPrep,
  type FunnelSignup,
  type FunnelTopic,
  type GrowthFunnel,
} from "@/lib/admin/funnel-math";

/*
  Büyüme hunisinin okuması (20 Kasım 2026). Yalnız okur, hiçbir şey yazmaz. Her kaynak kendi başına okunur; biri
  düşerse o kaynağa dayanan sayı "okunamadı" olur (`funnel-math.ts`), sayfa düşmez. Sorgular sınırlı ve dizinli:

    profiles                  created_at ≥ 7 gün başı (kohort)                     en çok COHORT_LIMIT satır
    exam_preps                user_id IN kohort (dilim dilim; `exam_preps_user_id_idx`)
    exam_prep_topics          exam_prep_id IN hazırlıklar (`exam_prep_topics_prep_idx`)
    exam_prep_nodes           exam_prep_id IN hazırlıklar, kind = 'lesson' (`exam_prep_nodes_prep_idx`)
    exam_prep_node_attempts   node_id IN 1. konunun ders düğümleri, status = 'completed' (`…_node_idx`)
    payments                  created_at ≥ 7 gün başı ve (PayTR oturumu var ya da ödendi / iade)
    audit_logs                payment.token.created, 7 gün, yalnız veli yolları; yalnız `via` alanı okunur
    plans                     bütün paketler (birkaç satır)

  Kimlik listeleri 150'şerlik dilimle gider (adres uzunluğu); hazırlığa bağlı sorgular dilim başına sınırlıdır.
  Sınıra takılan kaynak `truncated` listesine yazılır ve ekranda söylenir (sayı eksik olabilir).
  PayTR oturumu ve denetim kaydının öbür alanları (IP, onay metni) okunmaz.
*/

export const FUNNEL_COHORT_LIMIT = 2000;
const SLICE = 150;
const PER_SLICE_LIMIT = 3000;
const PAYMENT_LIMIT = 5000;
const AUDIT_LIMIT = 5000;

export type LoadedFunnel = GrowthFunnel & {
  /** Okunamayan kaynakların Türkçe adları. */
  failed: string[];
  /** Satır sınırına takılan kaynakların Türkçe adları (sayı eksik olabilir). */
  truncated: string[];
};

type Row = Record<string, unknown>;
type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function slices<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += SLICE) out.push(items.slice(index, index + SLICE));
  return out;
}

async function read(label: string, failed: string[], run: () => PromiseLike<QueryResult>): Promise<Row[] | null> {
  try {
    const { data, error } = await run();
    if (!error) return Array.isArray(data) ? (data as Row[]) : [];
    console.warn("admin_funnel_source_failed", { label, cause: String(error.message ?? "").slice(0, 160) });
  } catch (error) {
    console.warn("admin_funnel_source_failed", { label, cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
  }
  failed.push(label);
  return null;
}

/** Dilim dilim okur; dilimlerden biri düşerse bütün kaynak okunamadı sayılır (yarım sayı gösterilmez). */
async function readSliced(
  label: string,
  failed: string[],
  truncated: string[],
  ids: readonly string[],
  run: (slice: string[]) => PromiseLike<QueryResult>,
): Promise<Row[] | null> {
  if (!ids.length) return [];
  const local: string[] = [];
  const parts = await Promise.all(slices(ids).map((slice) => read(label, local, () => run(slice))));
  if (local.length) {
    failed.push(label);
    return null;
  }
  if (parts.some((part) => (part?.length ?? 0) >= PER_SLICE_LIMIT)) truncated.push(label);
  return parts.flatMap((part) => part ?? []);
}

export async function loadGrowthFunnel(service: SupabaseClient, now: Date = new Date()): Promise<LoadedFunnel> {
  const windows = funnelWindows(now);
  const failed: string[] = [];
  const truncated: string[] = [];

  const [profileRows, paymentRows, auditRows, planRows] = await Promise.all([
    read("yeni kayıtlar", failed, () =>
      service.from("profiles").select("id, created_at").gte("created_at", windows.week).order("created_at", { ascending: false }).limit(FUNNEL_COHORT_LIMIT),
    ),
    read("ödemeler", failed, () =>
      service
        .from("payments")
        .select("merchant_oid, user_id, beneficiary_user_id, plan_id, status, created_at")
        .gte("created_at", windows.week)
        .or("paytr_token.not.is.null,status.eq.paid,status.eq.refunded")
        .limit(PAYMENT_LIMIT),
    ),
    read("veli ödemesi kaydı", failed, () =>
      service
        .from("audit_logs")
        .select("entity_id, via:metadata->>via")
        .eq("action", "payment.token.created")
        .in("metadata->>via", PARENT_PAYMENT_VIAS)
        .gte("created_at", windows.week)
        .limit(AUDIT_LIMIT),
    ),
    read("paketler", failed, () => service.from("plans").select("id, slug, name, tier, billing_period, is_premium")),
  ]);
  if ((profileRows?.length ?? 0) >= FUNNEL_COHORT_LIMIT) truncated.push("yeni kayıtlar");
  if ((paymentRows?.length ?? 0) >= PAYMENT_LIMIT) truncated.push("ödemeler");
  if ((auditRows?.length ?? 0) >= AUDIT_LIMIT) truncated.push("veli ödemesi kaydı");

  const signups: FunnelSignup[] | null = profileRows
    ? profileRows.map((row) => ({ id: text(row.id), createdAt: text(row.created_at) })).filter((row) => row.id && row.createdAt)
    : null;
  const cohortIds = [...new Set((signups ?? []).map((row) => row.id))];

  // Hazırlıklar yalnız kohort için; Stüdyo'nun geçici deneme kaydı ve "Hedef puan" kaydı sunucuda da elenir.
  const prepRows = signups
    ? await readSliced("hazırlıklar", failed, truncated, cohortIds, (slice) =>
        service
          .from("exam_preps")
          .select("id, user_id, exam_type")
          .in("user_id", slice)
          .neq("exam_type", STUDIO_EXAM_TYPE)
          .neq("exam_type", "hedef")
          .limit(PER_SLICE_LIMIT),
      )
    : null;
  const preps: FunnelPrep[] | null = prepRows
    ? prepRows
        .map((row) => ({ id: text(row.id), userId: text(row.user_id), examType: typeof row.exam_type === "string" ? row.exam_type : null }))
        .filter((row) => row.id && row.userId)
    : null;
  const prepIds = [...new Set((preps ?? []).map((row) => row.id))];

  const [topicRows, nodeRows] = preps
    ? await Promise.all([
        readSliced("konu sırası", failed, truncated, prepIds, (slice) =>
          service
            .from("exam_prep_topics")
            .select("id, exam_prep_id, document_topic_node_id, sort_order")
            .in("exam_prep_id", slice)
            .order("sort_order", { ascending: true })
            .limit(PER_SLICE_LIMIT),
        ),
        readSliced("ders adımları", failed, truncated, prepIds, (slice) =>
          service
            .from("exam_prep_nodes")
            .select("id, exam_prep_id, kind, status, title, session_meta")
            .in("exam_prep_id", slice)
            .eq("kind", "lesson")
            .limit(PER_SLICE_LIMIT),
        ),
      ])
    : [null, null];
  const topics: FunnelTopic[] | null = topicRows
    ? topicRows
        .map((row) => ({
          id: text(row.id),
          prepId: text(row.exam_prep_id),
          documentTopicNodeId: typeof row.document_topic_node_id === "string" ? row.document_topic_node_id : null,
          sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        }))
        .filter((row) => row.id && row.prepId)
    : null;
  const lessonNodes: FunnelNode[] | null = nodeRows
    ? nodeRows
        .map((row) => ({
          id: text(row.id),
          prepId: text(row.exam_prep_id),
          kind: text(row.kind),
          status: text(row.status),
          title: typeof row.title === "string" ? row.title : null,
          sessionMeta: row.session_meta ?? null,
        }))
        .filter((row) => row.id && row.prepId)
    : null;

  // Tamamlanmış kayıtlar yalnız 1. konunun ders düğümleri için okunur (birkaç satır).
  let attempts: FunnelAttempt[] | null = null;
  if (preps && topics && lessonNodes) {
    const lessonIds = [...firstUnitLessonNodeIds(lessonNodes, firstTopicIdsByPrep(topics)).keys()];
    const attemptRows = await readSliced("ders kayıtları", failed, truncated, lessonIds, (slice) =>
      service.from("exam_prep_node_attempts").select("user_id, node_id").in("node_id", slice).eq("status", "completed").limit(PER_SLICE_LIMIT),
    );
    attempts = attemptRows ? attemptRows.map((row) => ({ userId: text(row.user_id), nodeId: text(row.node_id) })).filter((row) => row.userId && row.nodeId) : null;
  }

  const payments: FunnelPayment[] | null = paymentRows
    ? paymentRows
        .map((row) => ({
          merchantOid: typeof row.merchant_oid === "string" ? row.merchant_oid : null,
          userId: text(row.user_id),
          beneficiaryUserId: typeof row.beneficiary_user_id === "string" && row.beneficiary_user_id ? row.beneficiary_user_id : null,
          planId: typeof row.plan_id === "string" ? row.plan_id : null,
          status: text(row.status),
          // Sorgu yalnız oturumu kurulmuş ya da sonuçlanmış satırları getirir: hepsi ödeme ekranını açmıştır.
          opened: true,
          createdAt: text(row.created_at),
        }))
        .filter((row) => row.userId && row.createdAt)
    : null;
  const plans: FunnelPlan[] | null = planRows
    ? planRows.map((row) => ({
        id: text(row.id),
        slug: typeof row.slug === "string" ? row.slug : null,
        name: typeof row.name === "string" ? row.name : null,
        tier: typeof row.tier === "string" ? row.tier : null,
        billingPeriod: typeof row.billing_period === "string" ? row.billing_period : null,
        isPremium: typeof row.is_premium === "boolean" ? row.is_premium : null,
      }))
    : null;
  const parentOids = auditRows ? new Set(auditRows.map((row) => text(row.entity_id)).filter(Boolean)) : null;

  const funnel = growthFunnel({ signups, preps, topics, lessonNodes, attempts, payments, plans, parentOids }, windows);
  return { ...funnel, failed: [...new Set(failed)], truncated: [...new Set(truncated)] };
}
