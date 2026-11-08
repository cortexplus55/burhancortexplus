// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { homeLine, moodAcknowledgement, pickBySeed, startGreeting, wrongAnswerLine, type CompanionSignals } from "@/lib/companion/voice";
import { coachReaction } from "@/lib/learning/coach-reactions";
import { pickReminder } from "@/lib/learning/study-reminder";
import { buildPrepProgressView, type ProgressNode } from "@/lib/learning/prep-progress-view";
import { LessonOpenChrome } from "@/components/parity/lesson-open-chrome";

/*
  Dost katmanı (8 Kasım 2026, ürün sahibi: "spora birlikte yazılan arkadaş gibi; her ekranda samimiyet; tahmin
  gerçek olsun"). Cümleler yalnız elimizdeki sinyalden kurulur; uydurma anı ve tutulamayan söz yok.
*/
const base: CompanionSignals = {
  firstName: "Ada",
  mood: null,
  streak: 0,
  daysSinceLast: null,
  examDaysLeft: null,
  hour: 14,
  seed: "2026-11-08",
};

describe("ana ekranın dost satırı", () => {
  it("sınav günü ve ertesi gün her şeyi bastırır", () => {
    expect(homeLine({ ...base, examDaysLeft: 0, daysSinceLast: 5, mood: "stressed" }).reason).toBe("exam_day");
    expect(homeLine({ ...base, examDaysLeft: 1, streak: 9 }).reason).toBe("exam_tomorrow");
  });

  it("üç gün ve üstü ara: geri çağırır, gün sayısını gerçek yazar, azarlamaz", () => {
    const line = homeLine({ ...base, daysSinceLast: 4, nextStep: { heading: "Osmoz", kindLabel: "Ders", minutes: 5 } });
    expect(line.reason).toBe("welcome_back");
    expect(line.text).toContain("4 gün");
    expect(line.text).toContain("Sıradaki: ders, ~5 dk");
    expect(line.text).not.toMatch(/yapmadın|tembel|kaçırdın/i);
  });

  it("dün kaçtıysa yumuşak; ruh hali varsa ona göre; seri varsa seri; yoksa saate göre", () => {
    expect(homeLine({ ...base, daysSinceLast: 2 }).reason).toBe("missed_yesterday");
    expect(homeLine({ ...base, daysSinceLast: 1, mood: "stressed" }).reason).toBe("mood");
    expect(homeLine({ ...base, daysSinceLast: 1, mood: "stressed" }).text).toMatch(/Baskı yok|Stres/);
    expect(homeLine({ ...base, daysSinceLast: 0, streak: 4 }).reason).toBe("studied_today");
    expect(homeLine({ ...base, daysSinceLast: 1, streak: 3 }).reason).toBe("streak");
    expect(homeLine({ ...base, hour: 7 }).reason).toBe("plain");
    expect(homeLine({ ...base, hour: 23 }).text).toMatch(/Geç oldu|ağır konu açma/);
  });

  it("seçim güne bağlı ve kararlı: aynı gün aynı cümle", () => {
    const a = homeLine({ ...base, daysSinceLast: 5 }).text;
    expect(homeLine({ ...base, daysSinceLast: 5 }).text).toBe(a);
    const options = ["x", "y", "z"] as const;
    expect(pickBySeed(options, "2026-11-08", "s")).toBe(pickBySeed(options, "2026-11-08", "s"));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => pickBySeed(options, `2026-11-${String(i + 1).padStart(2, "0")}`)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("öğretmenin ilk sözü duruma göre açılır ve her zaman soruyla biter", () => {
    const away = startGreeting({ ...base, daysSinceLast: 6 });
    expect(away).toContain("Merhaba Ada!");
    expect(away).toContain("Bir süredir yoktun");
    expect(away).toContain("fotoğrafını da gönderebilirsin");
    expect(startGreeting({ ...base, mood: "stressed" })).toContain("en kolay yerden");
    expect(startGreeting({ ...base, firstName: null })).toMatch(/^Merhaba! Bugün ne çalışmak istersin/);
  });
});

describe("derste ruh hali", () => {
  it("açılış kartında ruh hali cümlesi; nötrde yok", () => {
    expect(moodAcknowledgement("stressed", 5)).toContain("~5 dakika");
    expect(moodAcknowledgement("neutral", 5)).toBeNull();
    const view = render(
      <LessonOpenChrome
        step="create"
        recommendedTitle="Ders"
        topicLabel="Osmoz"
        moodLine={moodAcknowledgement("low_energy", 4)}
        onFamiliarity={() => undefined}
        onMood={() => undefined}
        onContinue={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(view.container.querySelector(".cp-open-mood-line")?.textContent).toContain("Enerjin düşükken");
  });

  it("yanlış cevapta koç cümlesi ruh haline göre; ruh hali yoksa eski cümle", () => {
    expect(coachReaction({ correct: false, streak: 0, mood: "stressed" }).text).toContain("Nefes al");
    expect(coachReaction({ correct: false, streak: 0, mood: "low_energy" }).text).toContain("olsun");
    expect(coachReaction({ correct: false, streak: 0 }).text).toContain("Moral bozmak yok");
    expect(coachReaction({ correct: true, streak: 1, mood: "stressed" }).text).toContain("Nokta atışı");
    expect(wrongAnswerLine("calm")).toBeNull();
  });
});

describe("hatırlatma: uzun arada dost sesi", () => {
  const input = {
    hasUnfinishedPath: true,
    hoursSinceActivity: 26,
    daysUntilExam: null,
    streakDays: 0,
    streakBreaksToday: false,
    alreadyNotifiedToday: false,
  };
  it("bir günde 'kaldığın yer', üç günden sonra gün sayısıyla çağırır", () => {
    expect(pickReminder(input)?.title).toBe("Kaldığın yer seni bekliyor");
    const away = pickReminder({ ...input, hoursSinceActivity: 24 * 4 + 3 });
    expect(away?.title).toBe("4 gündür görüşmedik");
    expect(away?.body).toContain("Dert değil");
  });
});

describe("tahmin gerçek veriden", () => {
  const nodes: ProgressNode[] = [
    { id: "l1", kind: "lesson", title: "A · Ders", status: "done", sessionMeta: { topicTitle: "A" } },
    { id: "q1", kind: "quiz", title: "A · Test", status: "done", sessionMeta: { topicTitle: "A" } },
    { id: "l2", kind: "lesson", title: "B · Ders", status: "ready", sessionMeta: { topicTitle: "B" } },
  ];
  const common = { nodes, topicLabels: ["A", "B"], gaps: [], examDate: "2026-11-30", targetScore: 75, dailyMinutes: 45, now: new Date("2026-11-08T12:00:00+03:00") };

  it("tek dersten tempo ve 'hedefe ~N günde' türetilmez", () => {
    const view = buildPrepProgressView({ ...common, attempts: [{ nodeId: "l1", score: 3, total: 3, createdAt: "2026-11-08T10:00:00+03:00" }], measuredReadinessPct: 24 });
    expect(view.forecast.kind).toBe("waiting");
    expect(view.forecast.kind === "waiting" && view.forecast.reason).toContain("Tek günden");
    expect(view.pace).toBeNull();
    expect(view.forecastSeries.pending).toBe(true);
    expect(view.forecastSeries.hitsTargetOn).toBeNull();
  });

  it("doğruluk %0 iken tahmin yok", () => {
    const view = buildPrepProgressView({
      ...common,
      attempts: [
        { nodeId: "l1", score: 0, total: 3, createdAt: "2026-11-06T10:00:00+03:00" },
        { nodeId: "q1", score: 0, total: 5, createdAt: "2026-11-07T10:00:00+03:00" },
      ],
      measuredReadinessPct: 24,
    });
    expect(view.forecast.kind === "waiting" && view.forecast.reason).toContain("%0");
  });

  it("iki ayrı günde puanlı çalışma ve ölçülmüş hazırlık varsa tahmin gelir", () => {
    const view = buildPrepProgressView({
      ...common,
      attempts: [
        { nodeId: "l1", score: 3, total: 3, createdAt: "2026-11-06T10:00:00+03:00" },
        { nodeId: "q1", score: 4, total: 5, createdAt: "2026-11-07T10:00:00+03:00" },
      ],
      measuredReadinessPct: 30,
    });
    expect(view.forecast.kind).toBe("ready");
    expect(view.pace).not.toBeNull();
    expect(view.forecastSeries.pending).toBeUndefined();
  });
});

describe("ruh hali ucu", () => {
  it("geçerli ruh halini günün kaydına yazar; bozuk gövde 400", async () => {
    vi.doMock("server-only", () => ({}));
    const inserts: unknown[] = [];
    vi.doMock("@/lib/api/guards", async () => {
      const { NextResponse } = await import("next/server");
      return {
        withUser: async () => ({ ok: true, ctx: { userId: "u1", service: { from: () => ({ insert: async (row: unknown) => (inserts.push(row), { error: null }) }) } } }),
        errorResponse: (status: number, code: string) => NextResponse.json({ code }, { status }),
      };
    });
    const { POST } = await import("@/app/api/student/mood/route");
    const ok = await POST(new Request("http://x/api/student/mood", { method: "POST", body: JSON.stringify({ mood: "stressed" }) }));
    expect(ok.status).toBe(200);
    expect(inserts).toEqual([{ user_id: "u1", mood: "stressed" }]);
    const bad = await POST(new Request("http://x/api/student/mood", { method: "POST", body: JSON.stringify({ mood: "kızgın" }) }));
    expect(bad.status).toBe(400);
  });
});
