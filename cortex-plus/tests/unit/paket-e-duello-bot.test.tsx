// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DUEL_SECONDS, questionPoints, type DuelQuestion } from "@/lib/learning/duel";
import {
  BOT_LEVELS,
  BOT_LEVEL_IDS,
  botComboUntil,
  botRun,
  botScoreUntil,
  botTimeline,
  headToHead,
  isBotLevel,
  seededRandom,
} from "@/lib/learning/duel-bot";
import { DuelPlay } from "@/components/duel/duel-play";

const read = (path: string) => readFileSync(path, "utf8");

const QUESTIONS: DuelQuestion[] = Array.from({ length: 7 }, (_, i) => ({
  text: `Soru ${i + 1}: hangisi doğru?`,
  options: ["A şıkkı", "B şıkkı", "C şıkkı", "D şıkkı", "E şıkkı"],
  answer: i % 5,
}));

describe("Paket E · bot rakip turu sunucuda, cevaplar istemciye gitmez", () => {
  afterEach(cleanup);

  it("aynı tohum aynı botu verir; farklı tohum farklı", () => {
    const a = botRun(QUESTIONS, "derece", "duel-1:x");
    const b = botRun(QUESTIONS, "derece", "duel-1:x");
    const c = botRun(QUESTIONS, "derece", "duel-1:y");
    expect(a.answers).toEqual(b.answers);
    expect(JSON.stringify(a.answers) === JSON.stringify(c.answers) && a.score === c.score).toBe(false);
    const r1 = seededRandom("s");
    const r2 = seededRandom("s");
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
    expect(seededRandom("s")()).not.toBe(seededRandom("t")());
  });

  it("üç zorluk: doğruluk ve süre kendi aralığında; yanlış seçim asla doğru şık değil", () => {
    for (const level of BOT_LEVEL_IDS) {
      const profile = BOT_LEVELS[level];
      let right = 0;
      let total = 0;
      for (let seed = 0; seed < 150; seed += 1) {
        const run = botRun(QUESTIONS, level, `seed-${seed}`);
        run.answers.forEach((answer, index) => {
          total += 1;
          const isRight = answer.choice === QUESTIONS[index]!.answer;
          if (isRight) right += 1;
          expect(answer.ms).toBeGreaterThanOrEqual(profile.msMin);
          expect(answer.ms).toBeLessThanOrEqual(Math.min(profile.msMax, DUEL_SECONDS * 1000 - 500));
          expect(run.steps[index]!.correct).toBe(isRight);
          expect(run.steps[index]!.points).toBe(questionPoints(isRight, answer.ms, index === QUESTIONS.length - 1));
        });
      }
      const accuracy = right / total;
      expect(Math.abs(accuracy - profile.accuracy), `${level} doğruluk ${accuracy.toFixed(2)}`).toBeLessThan(0.08);
    }
    // Şampiyon derece öğrencisinden, o da sınıf arkadaşından daha isabetli ve hızlı.
    expect(BOT_LEVELS.sampiyon.accuracy).toBeGreaterThan(BOT_LEVELS.derece.accuracy);
    expect(BOT_LEVELS.derece.accuracy).toBeGreaterThan(BOT_LEVELS.arkadas.accuracy);
    expect(BOT_LEVELS.sampiyon.msMax).toBeLessThan(BOT_LEVELS.derece.msMax);
    expect(BOT_LEVELS.derece.msMax).toBeLessThan(BOT_LEVELS.arkadas.msMax);
    expect(BOT_LEVELS.sampiyon.msMin).toBeLessThan(BOT_LEVELS.arkadas.msMin);
  });

  it("istemciye giden zaman çizgisinde şık yok; canlı puan ve kombo görünürlük kuralıyla", () => {
    const run = botRun(QUESTIONS, "sampiyon", "t");
    const timeline = botTimeline(run);
    expect(JSON.stringify(timeline)).not.toMatch(/"choice"|"answers"|"answer"/);
    expect(timeline.steps).toHaveLength(7);
    const steps = [
      { ms: 3000, correct: true, points: 14 },
      { ms: 5000, correct: true, points: 13 },
      { ms: 4000, correct: false, points: 0 },
      { ms: 2000, correct: true, points: 15 },
    ];
    expect(botScoreUntil(steps, 1, 1000)).toBe(14);
    expect(botScoreUntil(steps, 1, 5000)).toBe(27);
    expect(botScoreUntil(steps, 3, 2000)).toBe(42);
    expect(botComboUntil(steps, 1, 5000)).toBe(2);
    expect(botComboUntil(steps, 2, 4000)).toBe(0);
    expect(botComboUntil(steps, 3, 1999)).toBe(0);
    expect(botComboUntil(steps, 3, 2000)).toBe(1);
    expect(isBotLevel("derece")).toBe(true);
    expect(isBotLevel("x")).toBe(false);
  });

  it("kafa kafaya tablo: kazanan puandan, satırlar soru soru, ortalama süreler", () => {
    const bot = { score: 60, steps: [
      { ms: 4000, correct: true, points: 14 },
      { ms: 6000, correct: false, points: 0 },
      { ms: 3000, correct: true, points: 28 },
    ] };
    const versus = headToHead({
      studentScore: 65,
      studentAnswers: [{ choice: 0, ms: 5000 }, { choice: 1, ms: 7000 }, { choice: null, ms: 20000 }],
      correctIndexes: [0, 2, 1],
      bot,
    });
    expect(versus.winner).toBe("student");
    expect(versus.headline).toBe("Kazandın! 🏆");
    expect(versus.rows.map((row) => `${row.student}/${row.bot}`)).toEqual(["right/right", "wrong/wrong", "none/right"]);
    expect(versus.studentAvgMs).toBe(6000);
    expect(versus.botAvgMs).toBe(4333);
    expect(headToHead({ studentScore: 60, studentAnswers: [], correctIndexes: [], bot }).winner).toBe("tie");
    expect(headToHead({ studentScore: 10, studentAnswers: [], correctIndexes: [], bot }).headline).toBe("Bu sefer bot önde");
  });

  it("uç cevapları değil zaman çizgisini döner, kayıt yazmaz; sayfa ve hazırlık düğmesi bot düzeyini taşır", () => {
    const route = read("src/app/api/duels/[code]/bot/route.ts");
    expect(route).toContain("NextResponse.json(botTimeline(run))");
    expect(route).not.toContain(".insert(");
    expect(route).toMatch(/guestLimit\(request, \{ scope: "duel-bot"/);
    expect(read("src/app/duello/[code]/page.tsx")).toContain("initialBot={initialBot}");
    expect(read("src/components/duel/new-duel-button.tsx")).toContain("?bot=derece");
  });

  it("ekran: girişte zorluk seçimi; botla başlayınca üst çubukta bot akar; sonda kafa kafaya", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (url.endsWith("/bot")) {
        return new Response(
          JSON.stringify({
            level: "derece",
            name: "🤖 Derece Öğrencisi",
            steps: [{ ms: 50, correct: true, points: 15 }, { ms: 50, correct: false, points: 0 }],
            correct: 1,
            score: 15,
            total: 2,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ correct: 2, score: 30, total: 2, answers: [0, 1], rank: 1, leaderboard: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const questions = QUESTIONS.slice(0, 2).map(({ text, options }) => ({ text, options }));
    render(
      // Geri sayım (30 Ekim 2026) kendi testinde (`duello-geri-sayim.test.tsx`); burada akış doğrudan başlar.
      <DuelPlay code="abc12345" title="Hücre" topic={null} creatorName="Ayşe" questions={questions} initialBoard={[]} signedIn countdownSeconds={0} />,
    );
    expect(screen.getByText("🤖 Hemen şimdi AI rakiple kapış")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Şampiyon" }));
    fireEvent.click(screen.getByRole("button", { name: /🤖 Şampiyon ile başla/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/duels/abc12345/bot", expect.objectContaining({ method: "POST" })));
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ level: "sampiyon" });
    await waitFor(() => expect(document.querySelector(".cp-duel-bot")).toBeTruthy());
    expect(screen.getByText("🤖 Derece Öğrencisi")).toBeTruthy();
    // İki soruyu cevapla: bot adımları 50 ms'de görünür, sonra sonuç ve kafa kafaya tablo.
    fireEvent.click(screen.getByRole("button", { name: /A şıkkı/ }));
    await waitFor(() => expect(screen.getByText(/Soru 2 \/ 2/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /B şıkkı/ }));
    await waitFor(() => expect(document.querySelector(".cp-duel-versus")).toBeTruthy());
    expect(screen.getByText("Kazandın! 🏆")).toBeTruthy();
    expect(document.querySelector(".cp-duel-versus")!.getAttribute("data-winner")).toBe("student");
    expect(screen.getByRole("button", { name: /Botla yeniden/ })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
