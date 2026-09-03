import { describe, expect, it } from "vitest";
import {
  buildCalendarItems,
  daysUntil,
  filterCalendar,
  formatDayLabel,
  monthGrid,
  toIsoDate,
  upcoming,
} from "@/lib/learning/calendar";

const TODAY = new Date("2026-09-03T12:00:00");

const events = [
  { id: "e1", title: "Ödev teslimi", event_date: "2026-09-10", subject: "Matematik", note: null },
];

const preps = [
  { id: "p1", title: "Türev Sınavı", exam_type: "Matematik", exam_date: "2026-09-05" },
  { id: "p2", title: "Tarihsiz Hazırlık", exam_type: "Fizik", exam_date: null },
];

describe("buildCalendarItems", () => {
  it("kişisel etkinlik ve sınav tarihlerini birleştirir, tarihe göre sıralar", () => {
    const items = buildCalendarItems(events, preps);
    expect(items.map((i) => i.date)).toEqual(["2026-09-05", "2026-09-10"]);
    expect(items[0]).toMatchObject({ kind: "exam", prepId: "p1" });
    expect(items[1]).toMatchObject({ kind: "personal" });
  });

  // Tarihi olmayan hazırlık takvimde yer tutmamalı.
  it("sınav tarihi olmayan hazırlığı atlar", () => {
    const items = buildCalendarItems([], preps);
    expect(items).toHaveLength(1);
    expect(items.every((i) => i.prepId !== "p2")).toBe(true);
  });
});

describe("filterCalendar", () => {
  const items = buildCalendarItems(events, preps);

  it("tümünü döndürür", () => {
    expect(filterCalendar(items, "all")).toHaveLength(2);
  });

  it("yalnızca kişisel etkinlikler", () => {
    const mine = filterCalendar(items, "mine");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.kind).toBe("personal");
  });

  it("yalnızca sınavlar", () => {
    const exams = filterCalendar(items, "exams");
    expect(exams).toHaveLength(1);
    expect(exams[0]!.kind).toBe("exam");
  });
});

describe("upcoming", () => {
  it("geçmiş etkinlikleri eler, bugünü tutar", () => {
    const items = buildCalendarItems(
      [
        { id: "gecmis", title: "Dün", event_date: "2026-09-02", subject: null, note: null },
        { id: "bugun", title: "Bugün", event_date: "2026-09-03", subject: null, note: null },
      ],
      [],
    );
    const next = upcoming(items, TODAY);
    expect(next.map((i) => i.id)).toEqual(["bugun"]);
  });
});

describe("monthGrid", () => {
  it("42 gün döndürür ve pazartesi ile başlar", () => {
    const grid = monthGrid(2026, 8); // Eylül 2026
    expect(grid).toHaveLength(42);
    const first = new Date(`${grid[0]}T00:00:00`);
    expect(first.getDay()).toBe(1); // Pazartesi
  });

  it("ayın ilk gününü içerir", () => {
    expect(monthGrid(2026, 8)).toContain("2026-09-01");
  });

  // Ay başı pazartesiye denk geldiğinde önceki aydan gün çekilmemeli.
  it("ay pazartesi başlıyorsa ilk hücre ayın biridir", () => {
    const grid = monthGrid(2026, 5); // Haziran 2026, 1'i pazartesi
    expect(grid[0]).toBe("2026-06-01");
  });
});

describe("gün etiketleri", () => {
  it("kalan günü hesaplar", () => {
    expect(daysUntil("2026-09-05", TODAY)).toBe(2);
    expect(daysUntil("2026-09-03", TODAY)).toBe(0);
    expect(daysUntil("2026-09-01", TODAY)).toBe(-2);
  });

  it("okunur etiket üretir", () => {
    expect(formatDayLabel("2026-09-03", TODAY)).toBe("Bugün");
    expect(formatDayLabel("2026-09-04", TODAY)).toBe("Yarın");
    expect(formatDayLabel("2026-09-08", TODAY)).toBe("5 gün sonra");
    expect(formatDayLabel("2026-09-01", TODAY)).toBe("2 gün önce");
  });

  it("toIsoDate yerel tarihi sıfır dolgulu verir", () => {
    expect(toIsoDate(new Date("2026-01-05T23:00:00"))).toBe("2026-01-05");
  });
});
