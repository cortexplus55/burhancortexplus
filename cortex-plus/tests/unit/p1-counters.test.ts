import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LESSON_MIN_MINUTES,
  activityDurationMinutes,
  elapsedMinutes,
  lessonStepTotal,
} from "@/lib/learning/activity-duration";
import { oralDeskAnswer, oralFirstAnswer, oralFirstAnswerKey } from "@/lib/learning/oral-first-answer";
import { LEARNING_STEP_STARS, prepStars } from "@/lib/stars/rules";
import { writtenExamStars } from "@/lib/learning/mock-exam/prep-writeback";
import { scoreFlashcardsV2 } from "@/lib/learning/teaching-standards";
import {
  activitySucceeded,
  holdMasteryOnSuccess,
  holdTrackingOnSuccess,
  topicMasteryGain,
  type TopicMasterySnapshot,
  type TrackingPersisted,
} from "@/lib/learning/learning-tracking";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function topic(key: string, confidence: number, level: TopicMasterySnapshot["level"] = "emerging"): TopicMasterySnapshot {
  return {
    topicKey: key,
    measured: true,
    level,
    confidence,
    evidenceCount: 4,
    firstAttemptCorrect: 2,
    firstAttemptTotal: 4,
    independentCorrect: 2,
    independentTotal: 4,
    lastPracticedAt: null,
  };
}

function tracking(over: Partial<TrackingPersisted> = {}): TrackingPersisted {
  return {
    version: 1,
    updatedAt: "",
    programProgressPct: 40,
    topicMasteryPct: 50,
    examReadinessPct: 45,
    claimFullyReady: false,
    measuredTopicCount: 2,
    unmeasuredTopicCount: 1,
    openMisconceptions: 0,
    ...over,
  };
}

describe("P1-7 tek süre kayna??", () => {
  it("ders en az 5 dk; okuma süresi uzunsa onu yazar", () => {
    expect(activityDurationMinutes("lesson", { readingMinutes: 2 })).toBe(LESSON_MIN_MINUTES);
    expect(activityDurationMinutes("lesson", {})).toBe(LESSON_MIN_MINUTES);
    expect(activityDurationMinutes("lesson", { readingMinutes: 9 })).toBe(9);
    expect(activityDurationMinutes("lesson", { known: 3 })).toBe(LESSON_MIN_MINUTES);
  });

  it("kay?tl? süre, ö?e say?s? ve podcast süresi tür tahmininin önüne geçer", () => {
    expect(activityDurationMinutes("quiz", { known: 12 })).toBe(12);
    expect(activityDurationMinutes("quiz", { itemCount: 10 })).toBe(12);
    expect(activityDurationMinutes("podcast", { minutes: 9 })).toBe(9);
    expect(activityDurationMinutes("written_exam")).toBe(30);
  });

  it("takvim bütçesi (durationMinutes) yol kart?na yaz?lmaz; kart activityMinutes okur", () => {
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home).toMatch(/activityDurationMinutes\(node\.kind/);
    expect(home).not.toMatch(/durationMinutes \?\? 15/);
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toMatch(/activityMinutes/);
  });

  it("harcanan zaman gerçek fark; bo? ba?lang?ç 1 dk", () => {
    const now = Date.parse("2026-10-25T10:00:00Z");
    expect(elapsedMinutes(now - 7 * 60_000, now)).toBe(7);
    expect(elapsedMinutes(new Date(now - 90_000).toISOString(), now)).toBe(2);
    expect(elapsedMinutes(null, now)).toBe(1);
    expect(elapsedMinutes(now + 5_000, now)).toBe(1);
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).toMatch(/elapsedMinutes\(playStartedAt \?\? openedAtRef\.current\)/);
    expect(session).not.toMatch(/Date\.now\(\) - \(playStartedAt \?\? Date\.now\(\)\)/);
  });
});

describe("P1-7 ad?m paydas? yaln?z artar", () => {
  it("yaz?m? süren kavramlar paydaya ba?tan girer", () => {
    expect(lessonStepTotal(2, 3)).toBe(5);
    expect(lessonStepTotal(0, 0)).toBe(1);
    const steps = read("src/components/parity/exam-lesson-steps.tsx");
    expect(steps).toMatch(/if \(plannedSteps > stepTotal\) setStepTotal\(plannedSteps\)/);
  });
});

describe("P1-7 hâkimiyet ve haz?r olma ba?ar?l? etkinlikte dü?mez", () => {
  it("ba?ar?: yard?ms?z do?rular en az yar? ya da kan?ts?z etkinlik", () => {
    expect(activitySucceeded([])).toBe(true);
    expect(activitySucceeded([{ correct: true, hintAssisted: false }, { correct: false, hintAssisted: false }])).toBe(true);
    expect(
      activitySucceeded([
        { correct: true, hintAssisted: true },
        { correct: false, hintAssisted: false },
        { correct: true, hintAssisted: false },
        { correct: false, hintAssisted: false },
        { correct: false, hintAssisted: false },
      ]),
    ).toBe(false);
  });

  it("ba?ar?l? etkinlikte güven ve seviye korunur, ba?ar?s?zda dü?ebilir", () => {
    const prior = [topic("Solunum", 70, "solid")];
    const folded = [topic("solunum", 62, "emerging")];
    const held = holdMasteryOnSuccess(prior, folded, true);
    expect(held[0]).toMatchObject({ confidence: 70, level: "solid" });
    expect(holdMasteryOnSuccess(prior, folded, false)[0]).toMatchObject({ confidence: 62, level: "emerging" });
    const gain = topicMasteryGain({ prior, folded: held, evidenceKeys: ["solunum"], topicLabel: "Solunum" });
    expect(gain).toMatchObject({ before: 70, after: 70 });
  });

  it("haz?r olma yüzdesi ba?ar?l? etkinlikte geri gitmez", () => {
    const prev = tracking({ examReadinessPct: 55, topicMasteryPct: 60, programProgressPct: 40 });
    const next = tracking({ examReadinessPct: 48, topicMasteryPct: 52, programProgressPct: 45 });
    expect(holdTrackingOnSuccess(prev, next, true)).toMatchObject({
      examReadinessPct: 55,
      topicMasteryPct: 60,
      programProgressPct: 45,
    });
    expect(holdTrackingOnSuccess(prev, next, false).examReadinessPct).toBe(48);
    expect(holdTrackingOnSuccess(null, next, true)).toEqual(next);
  });
});

describe("P1-7 kart yüzdesi ve y?ld?zlar", () => {
  it("kart puan? bilinen / toplam; Zorland?m bilinen say?lmaz", () => {
    expect(scoreFlashcardsV2(5, { "0": true, "1": false, "2": true, "3": false, "4": false })).toMatchObject({
      score: 2,
      total: 5,
    });
  });

  it("puans?z ö?renme ad?mlar? sabit y?ld?z; podcast 20; son kontrol s?nav y?ld?z?", () => {
    expect(prepStars("lesson", null, null)).toBe(LEARNING_STEP_STARS);
    expect(prepStars("flashcards", 8, 8)).toBe(LEARNING_STEP_STARS);
    expect(prepStars("podcast", null, null)).toBe(20);
    expect(prepStars("final_check", 3, 3)).toBeGreaterThan(LEARNING_STEP_STARS);
  });

  it("yaz?l? deneme y?ld?z? do?ru say?s?ndan", () => {
    const items = [{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }] as unknown as Parameters<
      typeof writtenExamStars
    >[0];
    expect(writtenExamStars(items)).toBe(prepStars("written_exam", 2, 3));
    expect(read("src/lib/learning/mock-exam/prep-writeback.ts")).toMatch(/awardStars\(/);
  });
});

describe("P1-7 sözlü süre bitimi ilk cevab? korur", () => {
  it("takip aç?kken ilk cevap ayr?, cevap birle?ik", () => {
    expect(oralDeskAnswer({ probeOpen: true, firstAnswer: " Mol say?s? ", follow: "Avogadro", value: "" })).toEqual({
      answer: "Mol say?s?\nAvogadro",
      firstAnswer: "Mol say?s?",
    });
    expect(oralDeskAnswer({ probeOpen: false, firstAnswer: "", follow: "", value: "cevap" })).toEqual({ answer: "cevap" });
    expect(oralFirstAnswer({ [oralFirstAnswerKey(0)]: "Mol say?s?", "0": "Mol say?s?\nAvogadro" }, 0)).toBe("Mol say?s?");
  });

  it("süre bitimi ve S?nav? bitir ayn? finishNow yolundan geçer", () => {
    const desk = read("src/components/parity/oral-answer-desk.tsx");
    expect(desk).toMatch(/left === 0\) finishNow\(\)/);
    expect(desk).toMatch(/onFinish\(out\.answer, out\.firstAnswer\)/);
  });
});
