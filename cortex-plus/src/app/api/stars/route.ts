import { NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { LEADERBOARD_MIN_PEOPLE, LEADERBOARD_TOP } from "@/lib/stars/rules";
import { toLeaderboardRows, toMyStars, type StarPeriod, type StarScope } from "@/lib/stars/view";

const SCOPES = new Set<StarScope>(["school", "country", "schools"]);
const PERIODS = new Set<StarPeriod>(["week", "all"]);

/**
 * Yıldızlar penceresi (17 Ekim 2026, Astra'daki gibi): öğrencinin kendi yıldızları ve
 * seçilen sıralama. Okul arkadaşları sıralamasında bu hafta 3 kişi yıldız kazanmadıysa
 * geçen haftanın kazananları gelir ("Bu hafta üç kişi yıldız kazanana kadar…").
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "stars-read", limit: 60 });
  if (!guard.ok) return guard.response;
  const { supabase } = guard.ctx;

  const url = new URL(request.url);
  // Üst çubuk yalnız bugünün sayısını ister ("Yıldızlar: bugün 11 / 50").
  if (url.searchParams.get("only") === "me") {
    const mine = await supabase.rpc("my_stars");
    if (mine.error) return errorResponse(503, "stars_unavailable");
    return NextResponse.json({ me: toMyStars(mine.data) });
  }
  const scope = (url.searchParams.get("scope") ?? "school") as StarScope;
  const period = (url.searchParams.get("period") ?? "week") as StarPeriod;
  if (!SCOPES.has(scope) || !PERIODS.has(period)) return errorResponse(400, "invalid_input");

  const [mine, board] = await Promise.all([
    supabase.rpc("my_stars"),
    supabase.rpc("star_leaderboard", { p_scope: scope, p_period: period, p_limit: LEADERBOARD_TOP }),
  ]);
  if (mine.error || board.error) return errorResponse(503, "stars_unavailable");

  let rows = toLeaderboardRows(board.data);
  let fallback = false;
  if (scope === "school" && period === "week" && rows.filter((row) => row.stars > 0).length < LEADERBOARD_MIN_PEOPLE) {
    const last = await supabase.rpc("star_leaderboard", { p_scope: "school", p_period: "last_week", p_limit: LEADERBOARD_TOP });
    if (!last.error && toLeaderboardRows(last.data).length) {
      rows = toLeaderboardRows(last.data);
      fallback = true;
    }
  }
  return NextResponse.json({ me: toMyStars(mine.data), rows, fallback });
}
