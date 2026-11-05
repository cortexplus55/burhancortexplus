import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAiSpend, type AiSpend } from "@/lib/admin/ops-gauges";
import { spendBreakerState, type BreakerState } from "@/lib/billing/spend-breaker";
import { missingRelation } from "@/lib/learning/missing-column";
import {
  cockpitWindows,
  conversionStats,
  countByWindow,
  distinctByWindow,
  effectiveUsdTry,
  FX_FLAG,
  marginPct,
  quarantineRow,
  reportRow,
  supersededRow,
  type ConversionStats,
  type PaymentRow,
  type PlanRow,
  type QuarantineRow,
  type ReportRow,
  type SupersededRow,
  type UsdTry,
  type WindowCounts,
  type Windows,
} from "@/lib/admin/cockpit-math";

/*
  Kurucu kokpiti (5 Kasım 2026): büyüme, dönüşüm, birim ekonomisi ve kalite kuyruğu tek ekranda.
  Her kaynak kendi başına okunur; biri düşerse ekranın o kutusu "okunamadı" der, sayfa düşmez
  (`settle`). Yük sınırlı: son 30 günün satırları, en çok birkaç bin; sayımlar burada yapılır ki
  üç pencere (bugün / 7 gün / 30 gün) tek sorguyla çıksın.
*/

export type CockpitEconomics = {
  spendToday: AiSpend | null;
  spendMonth: AiSpend | null;
  /** Bayraktaki kur ya da varsayılan (`source` ekranda yazılır). */
  usdTry: UsdTry;
  marginToday: number | null;
  marginMonth: number | null;
};

export type Cockpit = {
  windows: Windows;
  growth: { signups: WindowCounts; activeStudents: WindowCounts; totalUsers: number };
  conversions: ConversionStats;
  economics: CockpitEconomics;
  reports: ReportRow[];
  quarantine: QuarantineRow[];
  /** Eski sürüm (`stale`, karantinasız) sorular: içeriği emekli edilmiş; tek tıkla arşivlenir. */
  superseded: SupersededRow[];
  /** Günlük harcama sigortası (5 Kasım 2026): tavan, bugünkü gider, atmış mı; okunamadıysa null. */
  breaker: BreakerState | null;
  /** Okunamayan kaynakların adları (ekranda "okunamadı"). */
  failed: string[];
};

const ROW_LIMIT = 5000;
const QUEUE_LIMIT = 30;
const SUPERSEDED_LIMIT = 300;

type Row = Record<string, unknown>;

async function settle<T>(
  label: string,
  failed: string[],
  run: () => PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>,
  fallback: T,
): Promise<T> {
  try {
    const { data, error } = await run();
    if (!error) return data ?? fallback;
    if (!missingRelation(error)) {
      console.warn("admin_cockpit_source_failed", { label, cause: String(error.message ?? "").slice(0, 160) });
      failed.push(label);
    }
    return fallback;
  } catch (error) {
    console.warn("admin_cockpit_source_failed", { label, cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
    failed.push(label);
    return fallback;
  }
}

export async function loadCockpit(service: SupabaseClient, now: Date = new Date()): Promise<Cockpit> {
  const windows = cockpitWindows(now);
  const failed: string[] = [];

  const [profiles, totalUsers, attempts, payments, plans, fx, spendToday, spendMonth, reportRows, quarantineRows, supersededRows] = await Promise.all([
    settle<Row[]>("kayıtlar", failed, () => service.from("profiles").select("id, created_at").gte("created_at", windows.month).limit(ROW_LIMIT), []),
    settle<number | null>(
      "toplam kullanıcı",
      failed,
      async () => {
        const { count, error } = await service.from("profiles").select("id", { count: "exact", head: true });
        return { data: count, error };
      },
      null,
    ),
    settle<Row[]>(
      "aktif öğrenci",
      failed,
      () => service.from("exam_prep_node_attempts").select("user_id, updated_at").gte("updated_at", windows.month).limit(ROW_LIMIT),
      [],
    ),
    settle<Row[]>(
      "ödemeler",
      failed,
      () =>
        service
          .from("payments")
          .select("user_id, beneficiary_user_id, plan_id, amount_try, status, created_at")
          .gte("created_at", windows.month)
          .limit(ROW_LIMIT),
      [],
    ),
    settle<Row[]>("planlar", failed, () => service.from("plans").select("id, slug, name"), []),
    settle<Row | null>("kur", failed, () => service.from("feature_flags").select("metadata").eq("key", FX_FLAG).maybeSingle(), null),
    readAiSpend(service, windows.today).catch(() => null),
    readAiSpend(service, windows.month).catch(() => null),
    settle<Row[]>(
      "soru bildirimleri",
      failed,
      () =>
        service
          .from("question_reports")
          .select("id, source, target_id, question_ref, prep_id, reason, note, question_snapshot, verdict, issue_kind, explanation, rewarded, created_at, resolved_at")
          .order("created_at", { ascending: false })
          .limit(QUEUE_LIMIT),
      [],
    ),
    settle<Row[]>(
      "karantina",
      failed,
      () =>
        service
          .from("item_bank")
          .select("id, program_id, unit_id, outcome_id, difficulty, stem, choices, answer, explanation, qa, created_at")
          .eq("status", "stale")
          .not("qa->quarantine", "is", null)
          .order("created_at", { ascending: false })
          .limit(QUEUE_LIMIT),
      [],
    ),
    settle<Row[]>(
      "eski sürüm",
      failed,
      () =>
        service
          .from("item_bank")
          .select("id, program_id, unit_id, outcome_id, difficulty, stem, qa, content_id, created_at")
          .eq("status", "stale")
          .is("qa->quarantine", null)
          .order("created_at", { ascending: false })
          .limit(SUPERSEDED_LIMIT),
      [],
    ),
  ]);

  // Eski sürüm sorusunun içeriği hâlâ yayındaysa (beklenmez) arşivlenmez: durumu birlikte okunur.
  const supersededContentIds = [...new Set(supersededRows.map((row) => (typeof row.content_id === "string" ? row.content_id : "")).filter(Boolean))];
  const supersededContents = supersededContentIds.length
    ? await settle<Row[]>("eski sürüm içeriği", failed, () => service.from("topic_content").select("id, status").in("id", supersededContentIds), [])
    : [];
  const contentStatus = new Map(supersededContents.map((row) => [String(row.id ?? ""), typeof row.status === "string" ? row.status : null]));

  const paymentRows = payments.map(
    (row): PaymentRow => ({
      user_id: String(row.user_id ?? ""),
      beneficiary_user_id: typeof row.beneficiary_user_id === "string" ? row.beneficiary_user_id : null,
      plan_id: typeof row.plan_id === "string" ? row.plan_id : null,
      amount_try: typeof row.amount_try === "number" ? row.amount_try : Number(row.amount_try ?? 0),
      status: String(row.status ?? ""),
      created_at: String(row.created_at ?? ""),
    }),
  );
  // Penceredeki ödeyenlerin daha önce ödemesi var mı: "ilk kez ödeyen" ancak onsuz doğru sayılır.
  const payerIds = [...new Set(paymentRows.filter((row) => row.status === "paid").map((row) => row.beneficiary_user_id ?? row.user_id))];
  const earlier = payerIds.length
    ? await settle<Row[]>(
        "önceki ödemeler",
        failed,
        () =>
          service
            .from("payments")
            .select("user_id, beneficiary_user_id")
            .eq("status", "paid")
            .lt("created_at", windows.month)
            .or(`user_id.in.(${payerIds.join(",")}),beneficiary_user_id.in.(${payerIds.join(",")})`)
            .limit(ROW_LIMIT),
        [],
      )
    : [];
  const earlierPayers = new Set(earlier.map((row) => String(row.beneficiary_user_id ?? row.user_id ?? "")));
  const planRows = plans.map((row): PlanRow => ({ id: String(row.id ?? ""), slug: String(row.slug ?? ""), name: String(row.name ?? "") }));
  const conversions = conversionStats(paymentRows, planRows, earlierPayers, windows);

  const usdTry = effectiveUsdTry(fx?.metadata);
  const economics: CockpitEconomics = {
    spendToday,
    spendMonth,
    usdTry,
    marginToday: marginPct(conversions.revenueKurus.today, spendToday?.usd ?? null, usdTry.rate),
    marginMonth: marginPct(conversions.revenueKurus.month, spendMonth?.usd ?? null, usdTry.rate),
  };

  // Sigorta durumu taze okunur (önbellek atlanır): kurucu kokpitte o anki gideri ve tavanı görsün.
  const breaker = await spendBreakerState(service, now, { fresh: true }).catch((error: unknown) => {
    console.warn("admin_cockpit_source_failed", { label: "sigorta", cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
    failed.push("sigorta");
    return null;
  });

  return {
    windows,
    growth: {
      signups: countByWindow(profiles.map((row) => (typeof row.created_at === "string" ? row.created_at : null)), windows),
      activeStudents: distinctByWindow(
        attempts.map((row) => ({ id: String(row.user_id ?? ""), at: typeof row.updated_at === "string" ? row.updated_at : null })),
        windows,
      ),
      totalUsers: totalUsers ?? 0,
    },
    conversions,
    economics,
    reports: reportRows.map(reportRow).filter((row): row is ReportRow => row !== null),
    quarantine: quarantineRows.map(quarantineRow).filter((row): row is QuarantineRow => row !== null),
    superseded: supersededRows
      .map((row) => supersededRow(row, contentStatus.get(typeof row.content_id === "string" ? row.content_id : "") ?? null))
      .filter((row): row is SupersededRow => row !== null),
    breaker,
    failed,
  };
}
