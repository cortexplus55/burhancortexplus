import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { createClient } from "@/lib/supabase/server";
import { DAILY_PUZZLES, type PuzzleId } from "@/lib/parity/daily-puzzles";
import { issuePuzzleToken, readPuzzleToken } from "@/lib/parity/puzzle-session";

/**
 * Günün bulmacaları.
 *
 * POST { action: "start" }  → imzalı başlangıç jetonu
 * POST { action: "finish" } → jetondan süreyi ölç, kaydet, tabloyu döndür
 * GET  ?puzzleId=…          → o bulmacanın bugünkü liderlik tablosu
 *
 * Süre istemciden alınmıyor; bkz. lib/parity/puzzle-session.ts.
 */

const startSchema = z.object({
  action: z.literal("start"),
  puzzleId: z.string().min(1).max(32),
});

const finishSchema = z.object({
  action: z.literal("finish"),
  puzzleId: z.string().min(1).max(32),
  token: z.string().min(1).max(512),
  moves: z.number().int().min(0).max(100000).optional(),
});

function isKnownPuzzle(id: string): id is PuzzleId {
  return DAILY_PUZZLES.some((p) => p.id === id);
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "lab-puzzle", limit: 120 });
  if (!guard.ok) return guard.response;
  const { userId } = guard.ctx;

  const body = await request.json().catch(() => null);
  const parsed = z.union([startSchema, finishSchema]).safeParse(body);
  if (!parsed.success || !isKnownPuzzle(parsed.data.puzzleId)) {
    return errorResponse(400, "invalid_input");
  }

  if (parsed.data.action === "start") {
    return NextResponse.json({
      token: issuePuzzleToken(userId, parsed.data.puzzleId),
    });
  }

  const { puzzleId, token, moves } = parsed.data;
  const read = readPuzzleToken(token, userId, puzzleId);
  if (!read.ok) return errorResponse(400, `token_${read.reason}`);

  // Alt sınır veritabanı kısıtıyla aynı: yarım saniyenin altı gerçek değil.
  const durationMs = Math.max(500, Math.round(read.elapsedMs));

  // Kullanıcı istemcisi: puzzle_submit içeride auth.uid() okuyor, servis
  // anahtarıyla çağrılsa NULL gelir ve fonksiyon 'not_authenticated' fırlatır.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("puzzle_submit", {
    p_puzzle_id: puzzleId,
    p_duration_ms: durationMs,
    p_moves: moves ?? null,
  });

  if (error) return errorResponse(500, "submit_failed");

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    durationMs,
    bestMs: row?.best_ms ?? durationMs,
    improved: Boolean(row?.improved),
  });
}

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "lab-puzzle-board", limit: 120 });
  if (!guard.ok) return guard.response;

  const puzzleId = new URL(request.url).searchParams.get("puzzleId") ?? "";
  if (!isKnownPuzzle(puzzleId)) return errorResponse(400, "invalid_input");

  // Kullanıcı bağlamıyla çağrılıyor: RPC içindeki auth.uid() "is_me" için lazım.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("puzzle_leaderboard", {
    p_puzzle_id: puzzleId,
    p_limit: 10,
  });

  if (error) return errorResponse(500, "board_failed");
  return NextResponse.json({ entries: data ?? [] });
}
