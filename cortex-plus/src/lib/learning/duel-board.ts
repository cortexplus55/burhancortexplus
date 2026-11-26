import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HIDDEN_PLAYER_NAME, isOffensiveName } from "@/lib/moderation/display-name-filter";

/**
 * Düello sıralaması (26 Kasım 2026, mobil 1. adım). Paylaşılan düello sayfası ve tur sonu aynı okuyucuyu kullanır.
 *
 * - Ad süzgece takılıyorsa ya da yönetici gizlediyse (bildirim "hidden") ya da iki ayrı kişi "uygunsuz ad" diye
 *   bildirdiyse ad "Oyuncu" görünür; puan ve sıra yerinde kalır.
 * - Oturumlu öğrencinin engellediği oyuncu (kişi ya da misafir turu) onun gördüğü sıralamada yoktur. Düelloyu kuranın
 *   engellediği oyuncu o düellonun sıralamasında kimseye görünmez (sıralama kurucunundur).
 * - Bildirim ve engel tabloları yoksa (göçten önce) yalnız ad süzgeci çalışır.
 */

export const DUEL_BOARD_LIMIT = 10;
export const AUTO_HIDE_REPORTS = 2;
const FETCH_LIMIT = 60;

export type DuelBoardRow = {
  runId: string;
  name: string;
  score: number;
  correct: number;
  /** Bu tur görüntüleyen öğrencinin mi (kendini bildiremez, engelleyemez). */
  own: boolean;
};

type RunRow = { id: string; player_id: string | null; display_name: string; score: number; correct: number };
type ReportRow = { run_id: string; status: string; reason: string; reporter_id: string | null; reporter_hash: string | null };
type BlockRow = { blocker_id: string; blocked_user_id: string | null; blocked_run_id: string | null };

export type DuelModeration = {
  hiddenRuns: Set<string>;
  blockedUsers: Set<string>;
  blockedRuns: Set<string>;
};

/** Bildirimlerden gizlenecek turlar: yönetici kararı ya da iki ayrı kişiden açık "uygunsuz ad" bildirimi. (Saf.) */
export function hiddenRunsFromReports(reports: readonly ReportRow[]): Set<string> {
  const hidden = new Set<string>();
  const offensive = new Map<string, Set<string>>();
  for (const report of reports) {
    if (report.status === "hidden") hidden.add(report.run_id);
    if (report.status !== "open" || report.reason !== "offensive_name") continue;
    const who = report.reporter_id ?? report.reporter_hash;
    if (!who) continue;
    const set = offensive.get(report.run_id) ?? new Set<string>();
    set.add(who);
    offensive.set(report.run_id, set);
  }
  for (const [runId, reporters] of offensive) if (reporters.size >= AUTO_HIDE_REPORTS) hidden.add(runId);
  return hidden;
}

/** Sıralamayı süzer ve adları gizler. (Saf; sınanıyor.) */
export function moderateBoard(
  runs: readonly RunRow[],
  moderation: DuelModeration,
  viewerId: string | null,
  limit = DUEL_BOARD_LIMIT,
): DuelBoardRow[] {
  const rows: DuelBoardRow[] = [];
  for (const run of runs) {
    const own = Boolean(viewerId && run.player_id === viewerId);
    if (!own && run.player_id && moderation.blockedUsers.has(run.player_id)) continue;
    if (!own && moderation.blockedRuns.has(run.id)) continue;
    const hide = moderation.hiddenRuns.has(run.id) || isOffensiveName(run.display_name);
    rows.push({ runId: run.id, name: hide ? HIDDEN_PLAYER_NAME : run.display_name, score: run.score, correct: run.correct, own });
    if (rows.length >= limit) break;
  }
  return rows;
}

async function moderationFor(
  service: SupabaseClient,
  runIds: string[],
  blockerIds: string[],
): Promise<DuelModeration> {
  const moderation: DuelModeration = { hiddenRuns: new Set(), blockedUsers: new Set(), blockedRuns: new Set() };
  const [reports, blocks] = await Promise.all([
    runIds.length
      ? service.from("duel_reports").select("run_id, status, reason, reporter_id, reporter_hash").in("run_id", runIds).limit(500)
      : Promise.resolve({ data: [], error: null }),
    blockerIds.length
      ? service.from("duel_blocks").select("blocker_id, blocked_user_id, blocked_run_id").in("blocker_id", blockerIds).limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (!reports.error) moderation.hiddenRuns = hiddenRunsFromReports((reports.data ?? []) as ReportRow[]);
  if (!blocks.error) {
    for (const block of (blocks.data ?? []) as BlockRow[]) {
      if (block.blocked_user_id) moderation.blockedUsers.add(block.blocked_user_id);
      if (block.blocked_run_id) moderation.blockedRuns.add(block.blocked_run_id);
    }
  }
  return moderation;
}

/** Bir düellonun görüntüleyene göre süzülmüş sıralaması. Okuma düşerse boş liste. */
export async function loadDuelBoard(
  service: SupabaseClient,
  duel: { id: string; creator_id: string },
  viewerId: string | null,
): Promise<DuelBoardRow[]> {
  const { data, error } = await service
    .from("prep_duel_runs")
    .select("id, player_id, display_name, score, correct, created_at")
    .eq("duel_id", duel.id)
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(FETCH_LIMIT);
  if (error || !data) return [];
  const runs = data as RunRow[];
  const blockers = [...new Set([duel.creator_id, viewerId].filter((id): id is string => Boolean(id)))];
  const moderation = await moderationFor(service, runs.map((run) => run.id), blockers).catch(() => ({
    hiddenRuns: new Set<string>(),
    blockedUsers: new Set<string>(),
    blockedRuns: new Set<string>(),
  }));
  return moderateBoard(runs, moderation, viewerId);
}
