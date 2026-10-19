import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPPORT_SLA } from "@/lib/support/sla";

/**
 * Kapalı beta çıkış ölçütleri (19 Ekim 2026, satışa hazırlık plan Faz 5.3). Tek kaynak: hedefler
 * burada, ölçüm veritabanından; `/admin/beta` tabloyu çizer. Sentry'deki kritik hata buradan
 * okunamıyor (panel girişi ve anahtar ürün sahibinde), o satır "elle" kalır.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type OpenPath = "ready" | "adopted" | "cold";

/**
 * Açılışın sunucu süresini yazar (istek başından yanıta). Rota bunu `after()` içinde çağırır:
 * yanıt beklemez, düşerse sessiz — ölçüm hiçbir dersi geciktirmemeli.
 */
export async function recordOpenTiming(
  service: SupabaseClient,
  row: { userId: string; kind: string; path: OpenPath; ms: number },
): Promise<void> {
  const ms = Math.max(0, Math.min(599_999, Math.round(row.ms)));
  try {
    await service.from("open_timings").insert({ user_id: row.userId, kind: row.kind, path: row.path, ms });
  } catch {
    /* ölçüm düşerse ders etkilenmez */
  }
}

/** En yakın sıra yöntemiyle yüzdelik (p95 = sıralı listede ⌈0,95·n⌉. değer). */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1] ?? null;
}

export type BetaMetrics = {
  days: number;
  droppedConcepts: number;
  coldLesson: { n: number; p95: number | null };
  readyLesson: { n: number; p95: number | null };
  adoptedLesson: { n: number; p95: number | null };
  payments: { paid: number; failed: number; rate: number | null };
  support: { total: number; answered: number; answeredLate: number; maxHours: number | null; openOverdue: number };
};

type TimingRow = { kind: string; path: string; ms: number };
type SupportRow = { status: string | null; created_at: string; answered_at: string | null };

export async function collectBetaMetrics(
  service: SupabaseClient,
  options: { now?: Date; days?: number } = {},
): Promise<BetaMetrics> {
  const now = options.now ?? new Date();
  const days = options.days ?? 7;
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const overdueBefore = new Date(now.getTime() - SUPPORT_SLA.hours * HOUR_MS).toISOString();

  const [dropped, timings, payments, support, overdue] = await Promise.all([
    service
      .from("lesson_generation_failures")
      .select("id", { count: "exact", head: true })
      .eq("reason", "concept_dropped")
      .gte("created_at", since),
    service.from("open_timings").select("kind, path, ms").eq("kind", "lesson").gte("created_at", since).limit(5000),
    service.from("payments").select("status").gte("created_at", since).limit(5000),
    service.from("support_requests").select("status, created_at, answered_at").gte("created_at", since).limit(2000),
    service
      .from("support_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .lt("created_at", overdueBefore),
  ]);

  const rows = (timings.data ?? []) as TimingRow[];
  const lesson = (path: OpenPath) => {
    const values = rows.filter((row) => row.path === path).map((row) => row.ms);
    return { n: values.length, p95: percentile(values, 95) };
  };

  const statuses = ((payments.data ?? []) as { status: string }[]).map((row) => row.status);
  const paid = statuses.filter((status) => status === "paid" || status === "refunded").length;
  const failed = statuses.filter((status) => status === "failed").length;

  const requests = (support.data ?? []) as SupportRow[];
  const answeredHours = requests
    .filter((row) => row.answered_at)
    .map((row) => (new Date(row.answered_at!).getTime() - new Date(row.created_at).getTime()) / HOUR_MS);

  return {
    days,
    droppedConcepts: dropped.count ?? 0,
    coldLesson: lesson("cold"),
    readyLesson: lesson("ready"),
    adoptedLesson: lesson("adopted"),
    payments: { paid, failed, rate: paid + failed ? paid / (paid + failed) : null },
    support: {
      total: requests.length,
      answered: answeredHours.length,
      answeredLate: answeredHours.filter((hours) => hours > SUPPORT_SLA.hours).length,
      maxHours: answeredHours.length ? Math.round(Math.max(...answeredHours) * 10) / 10 : null,
      openOverdue: overdue.count ?? 0,
    },
  };
}

export type CriterionStatus = "pass" | "fail" | "nodata" | "manual";
export type CriterionRow = { id: string; label: string; target: string; value: string; status: CriterionStatus; note?: string };

const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1).replace(".", ",")} sn`);

/** Plan Faz 5.3'teki altı ölçüt; sıra ve hedefler plandaki gibi. */
export function evaluateBetaCriteria(m: BetaMetrics): CriterionRow[] {
  const pct = m.payments.rate === null ? "—" : `%${(m.payments.rate * 100).toFixed(1).replace(".", ",")}`;
  return [
    {
      id: "dropped",
      label: "Atılan kavram",
      target: "0",
      value: String(m.droppedConcepts),
      status: m.droppedConcepts === 0 ? "pass" : "fail",
      note: "Düzelmeyen kavram dersten çıkarılıp öğrenciye söylendi; ayrıntı /admin/ders-hatalari.",
    },
    {
      id: "cold",
      label: "Soğuk ders ilk ekran (p95)",
      target: "< 20 sn",
      value: `${seconds(m.coldLesson.p95)} · ${m.coldLesson.n} açılış`,
      status: m.coldLesson.p95 === null ? "nodata" : m.coldLesson.p95 < 20_000 ? "pass" : "fail",
      note: "Hazır ders yokken; sunucu süresi, ağ hariç.",
    },
    {
      id: "ready",
      label: "Hazır ders açılışı (p95)",
      target: "< 3 sn",
      value: `${seconds(m.readyLesson.p95)} · ${m.readyLesson.n} açılış`,
      status: m.readyLesson.p95 === null ? "nodata" : m.readyLesson.p95 < 3_000 ? "pass" : "fail",
      note: `Yazımı sürerken devralınan: ${seconds(m.adoptedLesson.p95)} · ${m.adoptedLesson.n} açılış (ölçüte girmez).`,
    },
    {
      id: "payments",
      label: "Ödeme başarısı",
      target: "> %95",
      value: `${pct} · ${m.payments.paid} başarılı, ${m.payments.failed} başarısız`,
      status: m.payments.rate === null ? "nodata" : m.payments.rate > 0.95 ? "pass" : "fail",
      note: "Bekleyen ödeme sayılmaz; iade edilen başarılı sayılır.",
    },
    {
      id: "support",
      label: "Destek cevabı",
      target: `< ${SUPPORT_SLA.hours} saat`,
      value: m.support.total
        ? `${m.support.answered}/${m.support.total} cevaplandı · en uzun ${m.support.maxHours ?? "—"} saat · ${m.support.openOverdue} gecikmiş açık`
        : `talep yok · ${m.support.openOverdue} gecikmiş açık`,
      status:
        m.support.openOverdue > 0 || m.support.answeredLate > 0 ? "fail" : m.support.total === 0 ? "nodata" : "pass",
      note: "Cevap e-postayla gider; /admin/destek'te \"Cevaplandı\" denince süre yazılır.",
    },
    {
      id: "sentry",
      label: "Sentry'de çözülmemiş kritik hata",
      target: "0",
      value: "Sentry panelinden",
      status: "manual",
      note: "Sentry anahtarı ürün sahibinde; panelde Issues → is:unresolved level:fatal.",
    },
  ];
}
