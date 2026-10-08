import { describe, expect, it } from "vitest";
import {
  activityWeeks,
  countByDay,
  currentStreak,
  lastDays,
} from "@/lib/learning/activity-history";

/**
 * Çalışma geçmişi.
 *
 * Referans ürünün "Aktivitelerim" ekranında son yedi günün çubukları ve yıllık
 * bir ısı haritası var; ikisi de alındı. Üçüncü kutu olan "tüm zamanların
 * tasarrufları — 2.318 ₺" alınmadı: ölçülen bir şey değil, saat sayısının
 * bir ders ücretiyle çarpımı.
 *
 * Aynı sebeple burada DAKİKA değil ETKİNLİK sayılıyor.
 */
// Saatler Türkiye saatiyle yazılı; test makinesinin saat diliminden bağımsız.
const today = new Date("2026-09-11T12:00:00+03:00"); // 11 Eylül 2026, Cuma

const DAY_MS = 86_400_000;
const stamp = (daysAgo: number, hour = 10) =>
  new Date(
    Date.parse(`2026-09-11T${String(hour).padStart(2, "0")}:00:00+03:00`) - daysAgo * DAY_MS,
  ).toISOString();

describe("countByDay", () => {
  it("groups timestamps into days", () => {
    const counts = countByDay([stamp(0, 9), stamp(0, 21), stamp(1)]);
    expect(counts.get("2026-09-11")).toBe(2);
    expect(counts.get("2026-09-10")).toBe(1);
  });

  it("ignores a timestamp it cannot read", () => {
    expect(countByDay(["", "belki yarın"]).size).toBe(0);
  });
});

describe("lastDays", () => {
  it("fills the quiet days with zero instead of skipping them", () => {
    // Boş günü atlamak grafiği yalan söyletir: çalışılmayan gün de gün.
    const week = lastDays([stamp(0), stamp(3)], 7, today);
    expect(week).toHaveLength(7);
    expect(week[6]).toEqual({ date: "2026-09-11", count: 1 });
    expect(week[3]).toEqual({ date: "2026-09-08", count: 1 });
    expect(week[5].count).toBe(0);
  });

  it("ends with today, not with the last day studied", () => {
    expect(lastDays([stamp(5)], 7, today)[6].date).toBe("2026-09-11");
  });
});

describe("currentStreak", () => {
  it("counts back while the days are unbroken", () => {
    expect(currentStreak([stamp(0), stamp(1), stamp(2)], today)).toBe(3);
  });

  it("does not punish a day that has not ended yet", () => {
    // Bugün henüz çalışılmadıysa seri kırılmış sayılmaz; gün bitmedi.
    expect(currentStreak([stamp(1), stamp(2)], today)).toBe(2);
  });

  it("stops at the gap", () => {
    expect(currentStreak([stamp(0), stamp(2), stamp(3)], today)).toBe(1);
  });

  it("is zero when nothing was ever done", () => {
    expect(currentStreak([], today)).toBe(0);
  });
});

describe("activityWeeks", () => {
  it("returns 52 weeks of 7 slots", () => {
    const weeks = activityWeeks([stamp(0)], today);
    expect(weeks).toHaveLength(52);
    expect(weeks[0]).toHaveLength(7);
  });

  it("leaves the rest of this week empty instead of pretending", () => {
    // Bugün cuma; cumartesi ve pazar henüz gelmedi.
    const weeks = activityWeeks([stamp(0)], today);
    const thisWeek = weeks[weeks.length - 1];
    expect(thisWeek[4]?.date).toBe("2026-09-11");
    expect(thisWeek[5]).toBeNull();
    expect(thisWeek[6]).toBeNull();
  });
});

describe("after midnight in Turkey, while the server's UTC day is still yesterday", () => {
  // 1 Ekim 2026 01:30 Türkiye = 30 Eylül 22:30 UTC. Sunucu UTC'de; yerel
  // günle hesaplandığında grafik 30 Eylül'de bitiyor, bu gece bitirilen
  // etkinlik dünün sütununa yazılıyordu.
  const now = new Date("2026-09-30T22:30:00Z");
  const tonight = "2026-09-30T22:10:00Z"; // 1 Ekim 01:10
  const yesterday = "2026-09-30T09:00:00Z"; // 30 Eylül 12:00

  it("counts tonight's activity on 1 October", () => {
    const counts = countByDay([tonight, yesterday]);
    expect(counts.get("2026-10-01")).toBe(1);
    expect(counts.get("2026-09-30")).toBe(1);
  });

  it("ends the last seven days on 1 October", () => {
    const week = lastDays([tonight], 7, now);
    expect(week[6]).toEqual({ date: "2026-10-01", count: 1 });
    expect(week[0].date).toBe("2026-09-25");
  });

  it("puts Thursday 1 October last in the year map", () => {
    const weeks = activityWeeks([tonight], now);
    const thisWeek = weeks[weeks.length - 1];
    expect(thisWeek[0]?.date).toBe("2026-09-28");
    expect(thisWeek[3]).toEqual({ date: "2026-10-01", count: 1 });
    expect(thisWeek[4]).toBeNull();
  });

  it("keeps the streak going across midnight", () => {
    expect(currentStreak([tonight, yesterday], now)).toBe(2);
  });
});
