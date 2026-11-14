import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NOT_STUDIO_EXAM_FILTER } from "@/lib/learning/studio-exam";
import { nextPrepStep, type PrepCardNode } from "@/lib/learning/prep-cards";
import { pathCompletion } from "@/lib/learning/prep-metrics";
import { applyDisplayDates, pathOriginDay } from "@/lib/learning/path-dates";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { nodeOnTopic } from "@/lib/learning/topic-identity";
import { istanbulDay } from "@/lib/istanbul-day";
import { examPrepNodeHref } from "@/lib/learning/exam-prep-hrefs";
import { orderCockpitPreps, type CockpitPrep, type CockpitStep, type CockpitTopic } from "@/lib/learning/home-cockpit-model";

export type NodeRow = {
  id: string;
  exam_prep_id: string;
  status: string | null;
  kind: string | null;
  title: string | null;
  sort_order: number | null;
  session_meta: Record<string, unknown> | null;
};

type TopicRow = {
  id: string;
  exam_prep_id: string;
  label: string | null;
  sort_order: number | null;
  status: string | null;
  document_topic_node_id: string | null;
};

function cardNode(row: NodeRow): PrepCardNode {
  return {
    status: (row.status as PrepCardNode["status"]) ?? "locked",
    id: String(row.id),
    kind: row.kind,
    title: row.title,
    sortOrder: row.sort_order,
    sessionMeta: (row.session_meta as PrepCardNode["sessionMeta"]) ?? null,
  };
}

function toStep(next: ReturnType<typeof nextPrepStep>): CockpitStep | null {
  return next ? { heading: next.heading, kindLabel: next.kindLabel, href: next.href } : null;
}

function daysUntil(examDate: string | null, today: string): number | null {
  if (!examDate) return null;
  return Math.round((Date.parse(`${examDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * "Geride" (13 Kasım 2026, ürün sahibinin seçimi a): yolda günü geçmiş ama bitmemiş adım. Tarih yolun kendi
 * gösterim kuralından (`applyDisplayDates`, hazırlık sayfasının tarihleriyle aynı); yeni plan hesabı yok.
 */
export function pathIsBehind(
  rows: readonly NodeRow[],
  options: { createdAt: string | null; examDate: string | null; today: string; skipKinds: ReadonlySet<string> },
): boolean {
  const dated = rows
    .filter((row) => row.kind && row.kind in PLAN_NODE_META && !options.skipKinds.has(row.kind) && row.status !== "hidden")
    .map((row) => ({
      id: String(row.id),
      kind: row.kind as PlanNodeKind,
      sortOrder: Number(row.sort_order ?? 0),
      sessionMeta: (row.session_meta as { calendarDate?: string | null } | null) ?? null,
      status: row.status,
    }));
  const withDates = applyDisplayDates(dated, { origin: pathOriginDay(options.createdAt), examDate: options.examDate });
  return withDates.some((node) => {
    const date = node.sessionMeta?.calendarDate;
    return node.status !== "done" && typeof date === "string" && date < options.today;
  });
}

/**
 * Ana ekranın bütün hazırlıkları, şerit sırasıyla. Devam kartıyla aynı süzgeç (hedef kaydı ve stüdyo hazırlığı
 * yok) ve aynı adım kuralı (`nextPrepStep`, ücretsizde Plus adımı atlanır). Üç sorgu: hazırlıklar, adımlar, konular.
 */
export async function loadHomeCockpit(
  supabase: SupabaseClient,
  userId: string,
  skipKinds: ReadonlySet<string> = new Set(),
  /**
   * Ücretsiz hesapta kilitli adımlar (Faz 3B): hazırlık başına `freeTopicLocks` ile aynı karar (adım sayfası ve
   * başlatma isteğiyle aynı kural). Verilmezse kilit yok; okuma düşerse o hazırlıkta kilit yok (öğrenci aleyhine hata yok).
   */
  lockedNodeIds?: (prepId: string, prepTitle: string, rows: readonly NodeRow[]) => Promise<ReadonlySet<string>>,
): Promise<CockpitPrep[]> {
  const { data: preps } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type, exam_date, created_at")
    .eq("user_id", userId)
    .neq("exam_type", "hedef")
    .or(NOT_STUDIO_EXAM_FILTER)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!preps?.length) return [];
  const ids = preps.map((prep) => String(prep.id));
  const [{ data: nodeRows }, { data: topicRows }] = await Promise.all([
    supabase
      .from("exam_prep_nodes")
      .select("id, exam_prep_id, status, kind, title, sort_order, session_meta")
      .in("exam_prep_id", ids),
    supabase
      .from("exam_prep_topics")
      .select("id, exam_prep_id, label, sort_order, status, document_topic_node_id")
      .in("exam_prep_id", ids),
  ]);
  const today = istanbulDay();
  const nodesByPrep = new Map<string, NodeRow[]>();
  for (const row of (nodeRows ?? []) as NodeRow[]) {
    const key = String(row.exam_prep_id);
    nodesByPrep.set(key, [...(nodesByPrep.get(key) ?? []), row]);
  }
  const topicsByPrep = new Map<string, TopicRow[]>();
  for (const row of (topicRows ?? []) as TopicRow[]) {
    const key = String(row.exam_prep_id);
    topicsByPrep.set(key, [...(topicsByPrep.get(key) ?? []), row]);
  }

  const lockSets = lockedNodeIds
    ? await Promise.all(
        preps.map((prep) =>
          lockedNodeIds(String(prep.id), String(prep.title ?? prep.exam_type ?? ""), nodesByPrep.get(String(prep.id)) ?? []).catch(
            () => new Set<string>() as ReadonlySet<string>,
          ),
        ),
      )
    : null;

  const built: CockpitPrep[] = preps.map((prep, index) => {
    const id = String(prep.id);
    const rows = nodesByPrep.get(id) ?? [];
    const lockedHrefs = new Set([...(lockSets?.[index] ?? [])].map((nodeId) => examPrepNodeHref(id, nodeId)));
    const step = (next: ReturnType<typeof nextPrepStep>) => {
      const value = toStep(next);
      return value && lockedHrefs.has(value.href) ? { ...value, locked: true } : value;
    };
    const steps = rows.filter((row) => !skipKinds.has(String(row.kind)));
    const cardNodes = steps.map(cardNode);
    const next = step(nextPrepStep(id, cardNodes, skipKinds));
    const examDate = prep.exam_date ? String(prep.exam_date).slice(0, 10) : null;
    const topics: CockpitTopic[] = (topicsByPrep.get(id) ?? [])
      .slice()
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      .map((topic) => {
        const identity = { id: topic.id, documentTopicNodeId: topic.document_topic_node_id, label: topic.label };
        const onTopic = steps.filter((row) => nodeOnTopic(row.session_meta as never, identity)).map(cardNode);
        return {
          id: String(topic.id),
          label: String(topic.label ?? ""),
          done: topic.status === "done",
          next: step(nextPrepStep(id, onTopic, skipKinds)),
        };
      });
    const nextTopic = next ? topics.findIndex((topic) => topic.next?.href === next.href) : -1;
    const firstOpen = topics.findIndex((topic) => !topic.done);
    return {
      id,
      title: String(prep.title ?? prep.exam_type),
      subject: (prep.exam_type as string | null) ?? null,
      examDate,
      daysLeft: daysUntil(examDate, today),
      behind: pathIsBehind(rows, {
        createdAt: (prep.created_at as string | null) ?? null,
        examDate,
        today,
        skipKinds,
      }),
      progress: pathCompletion(steps.map((row) => ({ status: (row.status as PrepCardNode["status"]) ?? "locked", kind: row.kind }))),
      next,
      topics,
      currentTopic: nextTopic >= 0 ? nextTopic : firstOpen >= 0 ? firstOpen : 0,
      href: `/deneme-sinavlari/${id}`,
      createdAt: (prep.created_at as string | null) ?? null,
    };
  });
  return orderCockpitPreps(built);
}
