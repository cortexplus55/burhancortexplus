import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfileDashboard } from "@/lib/student/profile-dashboard";

/**
 * Profil panelinin haftalık şeridi Türkiye takviminde.
 *
 * Sunucu UTC'de. Gün yerel saatle hesaplandığında gece 00:00–03:00 arası
 * "bugün" noktası dünün üstünde duruyordu; pazartesi gecesi şerit bütünüyle
 * geçen haftayı gösteriyor, bu haftanın çalışması hiç görünmüyordu.
 */

function fakeSupabase(activityDates: string[]) {
  const filters: { table: string; column: string; value: unknown }[] = [];
  const from = (table: string) => {
    const result =
      table === "user_activity_days"
        ? { data: activityDates.map((activity_date) => ({ activity_date })) }
        : { data: null, count: 0 };
    const builder = {
      select: () => builder,
      eq: () => builder,
      gte: (column: string, value: unknown) => {
        filters.push({ table, column, value });
        return builder;
      },
      lte: () => builder,
      maybeSingle: async () => ({ data: null }),
      then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, filters };
}

describe("loadProfileDashboard week strip", () => {
  it("marks Thursday 1 October as today at 01:30 in Turkey", async () => {
    // 1 Ekim 2026 01:30 Türkiye = 30 Eylül 22:30 UTC.
    const { client, filters } = fakeSupabase(["2026-10-01"]);
    const dashboard = await loadProfileDashboard(
      client,
      "user",
      new Date("2026-09-30T22:30:00Z"),
    );

    expect(dashboard.week.map((day) => day.iso)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(dashboard.week.filter((day) => day.isToday)).toEqual([
      { label: "Per", iso: "2026-10-01", isToday: true, active: true },
    ]);
    // Yaklaşan etkinlikler de bugünden sayılıyor, dünden değil.
    expect(filters).toContainEqual({
      table: "calendar_events",
      column: "event_date",
      value: "2026-10-01",
    });
  });

  it("shows this week, not last week, on Monday night", async () => {
    // 5 Ekim 2026 pazartesi 01:30 Türkiye = 4 Ekim pazar 22:30 UTC.
    const { client } = fakeSupabase(["2026-10-05"]);
    const dashboard = await loadProfileDashboard(
      client,
      "user",
      new Date("2026-10-04T22:30:00Z"),
    );
    expect(dashboard.week[0]).toEqual({
      label: "Pzt",
      iso: "2026-10-05",
      isToday: true,
      active: true,
    });
  });
});
