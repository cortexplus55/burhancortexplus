/**
 * Yazılı deneme durumu — salt okur (29 Ekim 2026, Paket H).
 *
 * Ekran durumu öğrenmek için üretim POST'unu yeniden çağırıyordu. Kira sahibi istek sessizce ölünce
 * (akış kopması, 300 sn sınırı) 330 sn'lik kira kimseye kalmıyor, her yoklama `running` dönüyor, bütçe
 * bitince öğrenciye "Yeniden dene" kalıyordu — kâğıt çoktan yayımlanmış olsa bile. Bu uç model çağırmaz,
 * kira almaz, ücret yazmaz: kayda bakar ve "yayımlandı mı?" der. Okuma hatası 500 değil `unknown`dur;
 * yoklayıcı sürer. Kullanıcı eşitliği her sorguda şart.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, withUser } from "@/lib/api/guards";
import { loadGenerationJob } from "@/lib/learning/generation-jobs";
import {
  mockExamStatusFromRows,
  type MockExamStatus,
  type MockStatusRow,
} from "@/lib/learning/mock-exam/progress";

export const maxDuration = 30;

/** İstemci saati ile veritabanı saati arasındaki pay. `recoverStaleMockBuilds`in 2 dakikalık yayın payıyla aynı. */
const SINCE_SLACK_MS = 2 * 60 * 1000;
/** Bundan eskisi hiçbir durumda bu isteğin kâğıdı değildir. */
const LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

const querySchema = z.object({
  prepId: z.string().uuid(),
  since: z.string().datetime({ offset: true }).optional(),
  resumeId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
});

const NO_STORE = { "Cache-Control": "no-store" } as const;

function sinceIso(since: string | undefined, now: number): string {
  const parsed = since ? Date.parse(since) : Number.NaN;
  const floor = now - LOOKBACK_MS;
  const base = Number.isFinite(parsed) ? parsed - SINCE_SLACK_MS : floor;
  return new Date(Math.max(floor, Math.min(now, base))).toISOString();
}

async function durableStatus(
  service: SupabaseClient,
  userId: string,
  jobId: string,
  now: number,
): Promise<MockExamStatus | null> {
  const row = await loadGenerationJob(service, jobId);
  if (!row || row.user_id !== userId || row.kind !== "mock_exam") return null;
  if (row.state === "done" && row.result_ref && row.result_ref !== "pending") {
    return { state: "published", examId: row.result_ref, jobId };
  }
  if (row.state === "failed") return { state: "failed", jobId };
  const progress = row.progress ?? {};
  return {
    state: "running",
    jobId,
    leaseAlive: Boolean(row.lease_until && Date.parse(row.lease_until) > now),
    ready: typeof progress.ready === "number" ? progress.ready : undefined,
    promised: typeof progress.promised === "number" ? progress.promised : undefined,
  };
}

async function recentRows(service: SupabaseClient, userId: string, prepId: string, since: string): Promise<MockStatusRow[]> {
  const { data, error } = await service
    .from("practice_exams")
    .select("id, blueprint, created_at")
    .eq("user_id", userId)
    .eq("exam_prep_id", prepId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error("status_read_failed");
  const rows: MockStatusRow[] = [];
  for (const row of Array.isArray(data) ? data : []) {
    if (!row || typeof row.id !== "string") continue;
    rows.push({ id: row.id, blueprint: row.blueprint, questionCount: null });
  }
  // Arka plan işinin kâğıdı `cpBuild` taşımaz: yayımlandığının kanıtı soru satırlarıdır.
  for (const row of rows) {
    const host = row.blueprint && typeof row.blueprint === "object" ? (row.blueprint as Record<string, unknown>) : null;
    if (host?.cpBuild) continue;
    const { count, error: countError } = await service
      .from("practice_exam_questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", row.id);
    row.questionCount = countError ? null : (count ?? 0);
  }
  return rows;
}

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "exam-mock-status", limit: 90 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId, since, resumeId, jobId } = parsed.data;
  const now = Date.now();

  try {
    const rows = await recentRows(service, userId, prepId, sinceIso(since, now));
    const fromRows = mockExamStatusFromRows(rows, { now, resumeId });
    if (fromRows.state === "published") return NextResponse.json(fromRows, { headers: NO_STORE });
    if (jobId) {
      const durable = await durableStatus(service, userId, jobId, now);
      if (durable) return NextResponse.json(durable, { headers: NO_STORE });
    }
    return NextResponse.json(fromRows, { headers: NO_STORE });
  } catch (error) {
    console.warn("mock_exam_status_unavailable", {
      prepId,
      message: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return NextResponse.json({ state: "unknown" } satisfies MockExamStatus, { headers: NO_STORE });
  }
}
