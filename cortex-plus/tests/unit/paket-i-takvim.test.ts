import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addDays, isoWeekday } from "@/lib/istanbul-day";
import {
  LONG_CHECK_LABEL,
  MAX_PLAN_DAYS,
  PATH_REVIEW_LADDER_DAYS,
  buildExamScheduleV2,
  listStudyDayDates,
  redistributeRemainingSchedule,
  schedulePlanMode,
  scheduleSessionsToNodeDrafts,
  spreadByLoad,
  type ScheduleSession,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { mergeStudyPathTemplate, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import {
  applyDisplayDates,
  daysBetween,
  isShortPlan,
  pathDayLabel,
  pathNodeWhenLabel,
  sectionDoneLabel,
  sectionHolidayNotes,
  sectionWhenLabel,
} from "@/lib/learning/path-dates";
import { REVIEW_SECTION_TITLE, buildPathSections } from "@/lib/learning/path-sections";
import { holidayRunsBetween, turkishHolidayOn } from "@/lib/learning/tr-calendar";
import { buildPrepProgressView, type ProgressNode } from "@/lib/learning/prep-progress-view";
import { parseLearningPreferences } from "@/lib/learning/exam-prep-ui-path";
import { examDayLabel, examTimeFromPreferences } from "@/lib/learning/exam-time";
import { buildCalendarItems } from "@/lib/learning/calendar";

/**
 * Paket I · çalışma takvimi (30 Ekim 2026). Canlı stres testi, iki öğrenci:
 * - Ece, 7,5 ay sonra final: konular 29 Eki – 25 Şub'a yığıldı, 26 Şub – 7 Haz (~15 hafta) boş; 23 Nisan,
 *   1 ve 19 Mayıs, Kurban Bayramı planda yok; aralıklı tekrar yok; 228 gün kalmışken "hedefe ~7 günde".
 * - Can, 2 gün sonra vize: 8 konudan 7'si "Bugün"e yığıldı, 2 günlük planda "1. Hafta"; sınav saati yok.
 * - İkisinde de bitmiş adımlar "Yarın" etiketli.
 * Konular farklı derslerden: kurallar derse bağlı değil.
 */

const MIXED_TOPICS: ScheduleTopicInput[] = [
  { id: "bio", title: "Hücre Bölünmesi", pageNumbers: [1, 2, 3] },
  { id: "mat", title: "Türev ve Uygulamaları", pageNumbers: [4, 5, 6], examHeavy: true },
  { id: "tar", title: "Osmanlı Devleti'nin Kuruluşu", pageNumbers: [7, 8] },
  { id: "kim", title: "Mol Kavramı", pageNumbers: [9, 10] },
  { id: "fiz", title: "Newton'un Hareket Yasaları", pageNumbers: [11, 12, 13], selfHard: true },
  { id: "tur", title: "Paragrafta Ana Düşünce", pageNumbers: [14] },
  { id: "huk", title: "Anayasanın Temel İlkeleri", pageNumbers: [15, 16] },
  { id: "ing", title: "Present Perfect Tense", pageNumbers: [17, 18] },
];

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

/** Takvimden yol düğümleri (kurulumun yaptığı gibi şablonla), ekranda görünen tarihleriyle. */
function pathNodes(sessions: ScheduleSession[], origin: string, examDate: string) {
  const drafts = mergeStudyPathTemplate(scheduleSessionsToNodeDrafts(sessions));
  const nodes = drafts.map((draft, index) => ({
    id: `n${index}`,
    kind: draft.kind,
    title: draft.title,
    sortOrder: draft.sortOrder,
    status: "locked",
    sessionMeta: draft.meta ?? null,
  }));
  return applyDisplayDates(nodes, { origin, examDate });
}

const weekOf = (iso: string) => addDays(iso, 1 - isoWeekday(iso));

describe("Paket I · uzun plan (230 gün)", () => {
  const from = new Date("2026-10-22T09:00:00+03:00");
  const origin = "2026-10-22";
  const examDate = addDays(origin, 230);
  const plan = buildExamScheduleV2({
    daysToExam: 230,
    dailyMinutes: 45,
    studyDays: EVERY_DAY,
    topics: MIXED_TOPICS,
    fromDate: from,
  });
  const lastStudyDay = addDays(examDate, -1);

  it("120 gün sınırı yok: takvim sınavdan önceki güne kadar", () => {
    expect(schedulePlanMode(230)).toBe("long");
    expect(plan.studyDayDates).toHaveLength(230);
    expect(plan.studyDayDates[plan.studyDayDates.length - 1]).toBe(lastStudyDay);
    expect(listStudyDayDates(400, EVERY_DAY, from)).toHaveLength(400);
    // Teknik tavan yalnız bozuk tarih için.
    expect(listStudyDayDates(5000, EVERY_DAY, from)).toHaveLength(MAX_PLAN_DAYS);
  });

  it("öğrenme dönemin bir bölümünde, sıra öğrencinin listesi; kalan süre tekrar, kontrol ve final", () => {
    const lessons = plan.sessions.filter((s) => s.role === "learn").sort((a, b) => a.sortOrder - b.sortOrder);
    expect(lessons.map((s) => s.topicId)).toEqual(MIXED_TOPICS.map((t) => t.id));
    const lastLesson = lessons[lessons.length - 1]!.calendarDate;
    // Son yeni konu sınavdan en az ~2,5 ay önce; ilk konu bugün.
    expect(daysBetween(lastLesson, examDate)).toBeGreaterThan(75);
    expect(lessons[0]!.calendarDate).toBe(origin);
    // Öğrenme penceresi de bir haftaya sıkışmaz: konular dönemin ilk yarısından fazlasına yayılır.
    expect(daysBetween(origin, lastLesson)).toBeGreaterThan(100);
    const mock = plan.sessions.find((s) => s.role === "mock")!;
    expect(daysBetween(mock.calendarDate, examDate)).toBeLessThanOrEqual(7);
  });

  it("finalden önceki hiçbir hafta boş değil; son dört hafta da dolu", () => {
    const busy = new Set(plan.sessions.map((s) => weekOf(s.calendarDate)));
    const empty: string[] = [];
    for (let week = weekOf(origin); week <= weekOf(lastStudyDay); week = addDays(week, 7)) {
      if (!busy.has(week)) empty.push(week);
    }
    expect(empty).toEqual([]);
    for (let back = 1; back <= 4; back += 1) {
      const day = addDays(examDate, -7 * back);
      expect(plan.sessions.some((s) => weekOf(s.calendarDate) === weekOf(day))).toBe(true);
    }
  });

  it("aralıklı tekrar: konular 21-45-90-150 gün sonra yeniden açılır, son haftalarda da tekrar var", () => {
    const long = plan.sessions.filter((s) => s.longReview != null);
    expect(long.every((s) => s.role === "review" && s.kind === "spaced")).toBe(true);
    const ladder = long.filter((s) => (s.longReview ?? 0) >= 1);
    // İlk konu (bugün öğrenildi) merdivenin dört basamağını da alır; aralıklar öğrenme gününden.
    const first = ladder.filter((s) => s.topicId === "bio").map((s) => daysBetween(origin, s.calendarDate));
    expect(first).toHaveLength(PATH_REVIEW_LADDER_DAYS.length);
    first.forEach((gap, index) => {
      expect(gap).toBeGreaterThanOrEqual(PATH_REVIEW_LADDER_DAYS[index]!);
      expect(gap).toBeLessThan(PATH_REVIEW_LADDER_DAYS[index]! + 7);
    });
    // Haziran'da ilk konular unutulmasın: finalden önceki son altı haftada birden çok konu tekrar edilir.
    const tail = plan.sessions.filter(
      (s) => s.role === "review" && s.calendarDate >= addDays(examDate, -49) && s.calendarDate < addDays(examDate, -7),
    );
    expect(new Set(tail.map((s) => s.topicId)).size).toBeGreaterThanOrEqual(3);
    // Aylık ara kontrol yolun ortasında (finale değil).
    const checks = plan.sessions.filter((s) => s.checkpoint === LONG_CHECK_LABEL);
    expect(checks.length).toBeGreaterThanOrEqual(5);
    expect(checks.every((s) => s.kind === "focused" && s.calendarDate < addDays(examDate, -7))).toBe(true);
  });

  it("tarihe bağlı adım yolda kendi gününde: önünde o güne kadarki dersler, ardında sonraki dersler", () => {
    const lessons = plan.sessions.filter((s) => s.role === "learn");
    for (const step of plan.sessions.filter((s) => s.longReview != null || s.checkpoint)) {
      for (const lesson of lessons) {
        if (lesson.calendarDate <= step.calendarDate) expect(lesson.sortOrder).toBeLessThan(step.sortOrder);
        else expect(lesson.sortOrder).toBeGreaterThan(step.sortOrder);
      }
    }
    // Yolda kendi bölümünde ("Aralıklı Tekrar ve Kontrol"); bölüm konu adı taşımaz, video bağlantısı almaz.
    const sections = buildPathSections(pathNodes(plan.sessions, origin, examDate), null);
    const review = sections.filter((section) => section.review);
    expect(review.length).toBeGreaterThan(0);
    expect(review.some((section) => section.title === REVIEW_SECTION_TITLE)).toBe(true);
  });

  it("tatil esnek gün kalır ve planın tamamında görünür: Nisan, Mayıs, Kurban Bayramı", () => {
    expect(turkishHolidayOn("2027-04-23")).toBe("Ulusal Egemenlik ve Çocuk Bayramı");
    for (const session of plan.sessions) {
      expect(Boolean(session.holiday)).toBe(Boolean(turkishHolidayOn(session.calendarDate)));
    }
    const dated = pathNodes(plan.sessions, origin, examDate);
    const sections = buildPathSections(dated, null);
    const notes = sectionHolidayNotes(
      sections.map((section) => section.nodes.map((node) => node.sessionMeta?.calendarDate ?? "")),
      origin,
      examDate,
    ).filter(Boolean) as string[];
    const all = notes.join(" | ");
    expect(all).toContain("🇹🇷 Resmî Tatil (Esnek Gün)");
    expect(all).toContain("29 Eki Cumhuriyet Bayramı");
    expect(all).toContain("1 Oca Yılbaşı");
    expect(all).toContain("23 Nis Ulusal Egemenlik ve Çocuk Bayramı");
    expect(all).toContain("1 May Emek ve Dayanışma Günü");
    // 2027'de 19 Mayıs Kurban Bayramı'nın son günü; arife bayrama katılır.
    expect(all).toContain("15–19 May Kurban Bayramı");
    // Her tatil bir kez: bölümler aralığı bölüşür.
    expect(all.match(/23 Nis/g)).toHaveLength(1);
  });

  it("hedef tahmini planın temposundan: 229 gün kalmışken '~7 günde' demez", () => {
    const dated = pathNodes(plan.sessions, origin, examDate);
    const firstLessonId = dated.find((node) => node.kind === "lesson")!.id;
    const nodes: ProgressNode[] = dated.map((node) => ({
      id: node.id,
      kind: node.kind as PlanNodeKind,
      title: node.title,
      status: node.id === firstLessonId ? "done" : "locked",
      sessionMeta: {
        topicTitle: node.sessionMeta?.topicTitle ?? undefined,
        calendarDate: node.sessionMeta?.calendarDate ?? undefined,
      },
    }));
    const now = new Date("2026-10-23T09:00:00+03:00");
    const view = buildPrepProgressView({
      nodes,
      attempts: [{ nodeId: firstLessonId, score: 3, total: 3, createdAt: "2026-10-22T10:00:00+03:00" }],
      topicLabels: MIXED_TOPICS.map((t) => t.title),
      gaps: [],
      examDate,
      targetScore: 75,
      dailyMinutes: 45,
      measuredReadinessPct: 10,
      now,
    });
    const pace = view.pace!;
    expect(pace.lessonsToTarget).toBe(7);
    // Planın 7. kalan dersi hangi gündeyse o. 30 Ekim 2026'dan beri yalnız ders düğümü ders sayılır (`LESSON_KINDS`).
    const lessonKinds = new Set<PlanNodeKind>(["lesson"]);
    const planned = nodes
      .filter((node) => lessonKinds.has(node.kind) && node.status !== "done")
      .map((node) => Math.max(0, daysBetween("2026-10-23", node.sessionMeta!.calendarDate!)) + 1)
      .sort((a, b) => a - b);
    expect(pace.daysToFinish).toBe(planned[6]);
    expect(pace.daysToFinish!).toBeGreaterThan(14);
    expect(pace.daysToFinish!).toBeLessThanOrEqual(229);
    // Tempo günde birin altında: "haftada N" yazılır, "günde 1" değil.
    expect(pace.perDay).toBeNull();
    expect(pace.perWeek).toBeGreaterThanOrEqual(1);
    expect(view.forecast.kind === "ready" && view.forecast.text).toContain(`yaklaşık ${pace.daysToFinish} günde`);
    expect(view.forecast.kind === "ready" && view.forecast.text).toContain(`haftada ${pace.perWeek}`);
    expect(view.forecastSeries.hitsTargetOn).toBe(pace.daysToFinish);
  });

  it("planın kalan dersleri hedefe yetmiyorsa '~X günde' denmez", () => {
    const nodes: ProgressNode[] = [
      { id: "a", kind: "lesson", title: "A · Ders", status: "done", sessionMeta: { topicTitle: "A", calendarDate: "2026-10-22" } },
      { id: "b", kind: "lesson", title: "B · Ders", status: "locked", sessionMeta: { topicTitle: "B", calendarDate: "2026-11-20" } },
      { id: "c", kind: "spaced", title: "B · Tekrar", status: "locked", sessionMeta: { topicTitle: "B", calendarDate: "2026-12-20" } },
    ];
    const view = buildPrepProgressView({
      nodes,
      attempts: [{ nodeId: "a", score: 3, total: 3, createdAt: "2026-10-22T10:00:00+03:00" }],
      topicLabels: ["A", "B"],
      gaps: [],
      examDate,
      targetScore: 75,
      dailyMinutes: 45,
      measuredReadinessPct: 10,
      now: new Date("2026-10-23T09:00:00+03:00"),
    });
    expect(view.pace?.lessonsToTarget).toBe(7);
    expect(view.pace?.daysToFinish).toBeNull();
    expect(view.pace?.perDay).toBeNull();
    expect(view.forecastSeries.hitsTargetOn).toBeNull();
    expect(view.forecast.kind === "ready" && view.forecast.text).not.toMatch(/günde/);
  });

  it("yeniden planlama: dersin ertesi günkü tekrar bitti diye uzun aralıklı tekrarlar düşmez", () => {
    const lesson = plan.sessions.find((s) => s.topicId === "bio" && s.role === "learn")!;
    const nextDay = plan.sessions.find((s) => s.topicId === "bio" && s.role === "review" && s.longReview == null)!;
    const rebuilt = redistributeRemainingSchedule({
      previous: plan,
      completed: [
        { sortOrder: lesson.sortOrder, calendarDate: lesson.calendarDate, kind: lesson.kind },
        { sortOrder: nextDay.sortOrder, calendarDate: nextDay.calendarDate, kind: nextDay.kind },
      ],
      fromDate: new Date("2026-11-01T09:00:00+03:00"),
      dailyMinutes: 45,
      studyDays: EVERY_DAY,
      daysToExam: daysBetween("2026-11-01", examDate),
      topics: MIXED_TOPICS,
    });
    const bio = rebuilt.sessions.filter((s) => s.topicId === "bio");
    expect(bio.filter((s) => s.role === "learn")).toHaveLength(1);
    expect(bio.some((s) => s.longReview != null && s.calendarDate > "2026-11-01")).toBe(true);
  });
});

describe("Paket I · kısa plan (sınav 7 günden yakın)", () => {
  const from = new Date("2026-10-29T09:00:00+03:00");
  const origin = "2026-10-29";
  const examDate = "2026-10-31";

  it("iki günlük vize planında konular iki güne bölünür, hepsi bugüne yığılmaz", () => {
    expect(schedulePlanMode(2)).toBe("short");
    const plan = buildExamScheduleV2({ daysToExam: 2, dailyMinutes: 45, studyDays: EVERY_DAY, topics: MIXED_TOPICS, fromDate: from });
    expect(plan.studyDayDates).toEqual(["2026-10-29", "2026-10-30"]);
    const lessons = plan.sessions.filter((s) => s.role === "learn").sort((a, b) => a.sortOrder - b.sortOrder);
    expect(lessons).toHaveLength(MIXED_TOPICS.length);
    expect(lessons.map((s) => s.topicId)).toEqual(MIXED_TOPICS.map((t) => t.id));
    const perDay = new Map<string, number>();
    for (const lesson of lessons) perDay.set(lesson.calendarDate, (perDay.get(lesson.calendarDate) ?? 0) + 1);
    expect([...perDay.keys()].sort()).toEqual(["2026-10-29", "2026-10-30"]);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(5);
    // Sıra değişmez: bir konunun günü öncekinden önce olamaz.
    for (let i = 1; i < lessons.length; i += 1) {
      expect(lessons[i]!.calendarDate >= lessons[i - 1]!.calendarDate).toBe(true);
    }
    // Her konunun testi dersiyle aynı gün; deneme son gün.
    for (const topic of MIXED_TOPICS) {
      const learn = lessons.find((s) => s.topicId === topic.id)!;
      const test = plan.sessions.find((s) => s.topicId === topic.id && s.kind === "quiz")!;
      expect(test.calendarDate).toBe(learn.calendarDate);
    }
    expect(plan.sessions.find((s) => s.role === "mock")?.calendarDate).toBe("2026-10-30");
  });

  it("öncelik süreye girer, sıraya değil: ağır ve zor konu günün büyük payını alır", () => {
    // Ağır/zor konuların yükü büyük: aynı güne daha az konu sığar.
    expect(spreadByLoad([1, 1, 1, 1, 1, 1, 1, 1], 2)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(spreadByLoad([3, 1, 1, 1, 1, 1, 1, 1], 2)).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
    const plan = buildExamScheduleV2({
      daysToExam: 4,
      dailyMinutes: 45,
      studyDays: EVERY_DAY,
      topics: MIXED_TOPICS,
      fromDate: from,
    });
    const lessons = plan.sessions.filter((s) => s.role === "learn").sort((a, b) => a.sortOrder - b.sortOrder);
    expect(lessons.map((s) => s.topicId)).toEqual(MIXED_TOPICS.map((t) => t.id));
    // Dört günlük planda son gün tekrar ve denemeye kalır; yeni konu ilk üç güne.
    expect(lessons.every((s) => s.calendarDate < "2026-11-01")).toBe(true);
    const days = new Set(lessons.map((s) => s.calendarDate));
    expect(days.size).toBe(3);
  });

  it("gün payı bütçeyle orantılı: tatil (esnek gün) ve denemenin günü daha az yeni konu alır", () => {
    expect(spreadByLoad([1, 1, 1, 1, 1, 1], 2, [45, 22])).toEqual([0, 0, 0, 0, 1, 1]);
    expect(spreadByLoad([1, 1, 1, 1, 1, 1], 2, [23, 45])).toEqual([0, 0, 1, 1, 1, 1]);
    // Tatilsiz iki gün (3–4 Kas 2026): yarın deneme de var, yeni konuların çoğu bugün.
    const plan = buildExamScheduleV2({
      daysToExam: 2,
      dailyMinutes: 45,
      studyDays: EVERY_DAY,
      topics: MIXED_TOPICS,
      fromDate: new Date("2026-11-03T09:00:00+03:00"),
    });
    const lessons = plan.sessions.filter((s) => s.role === "learn");
    const today = lessons.filter((s) => s.calendarDate === "2026-11-03").length;
    const tomorrow = lessons.filter((s) => s.calendarDate === "2026-11-04").length;
    expect(today + tomorrow).toBe(MIXED_TOPICS.length);
    expect(tomorrow).toBeGreaterThan(0);
    expect(today).toBeGreaterThanOrEqual(tomorrow);
    expect(today).toBeLessThan(MIXED_TOPICS.length);
  });

  it("yarın sınav: dersler tekrara çevrilmez, deneme de var", () => {
    const plan = buildExamScheduleV2({ daysToExam: 1, dailyMinutes: 45, studyDays: EVERY_DAY, topics: MIXED_TOPICS.slice(0, 3), fromDate: from });
    expect(plan.sessions.filter((s) => s.role === "learn")).toHaveLength(3);
    expect(plan.sessions.some((s) => s.role === "mock")).toBe(true);
  });

  it("kısa planda hafta yazılmaz; gün yazılır", () => {
    expect(isShortPlan(origin, examDate)).toBe(true);
    expect(isShortPlan(origin, "2026-11-20")).toBe(false);
    expect(sectionWhenLabel(["2026-10-29", "2026-10-30"], origin, origin, { examDate })).toBe("Bugün – Yarın");
    expect(sectionWhenLabel(["2026-10-30"], origin, origin, { examDate })).toBe("Yarın");
    expect(pathDayLabel("2026-10-30", "2026-10-28", { weekday: true })).toBe("Cum 30 Eki");
    expect(sectionWhenLabel(["2026-10-30", "2026-10-31"], "2026-10-28", "2026-10-28", { examDate: "2026-11-01" })).toBe(
      "Cum 30 Eki – Cmt 31 Eki",
    );
    // Uzun planda hafta etiketi aynı kalır.
    expect(sectionWhenLabel(["2026-10-26", "2026-11-01"], "2026-10-26", "2026-10-26", { examDate: "2026-12-06" })).toBe(
      "1. Hafta · 26 Eki – 1 Kas",
    );
    const plan = buildExamScheduleV2({ daysToExam: 2, dailyMinutes: 45, studyDays: EVERY_DAY, topics: MIXED_TOPICS, fromDate: from });
    const dated = pathNodes(plan.sessions, origin, examDate);
    for (const section of buildPathSections(dated, null)) {
      const label = sectionWhenLabel(
        section.nodes.map((node) => node.sessionMeta?.calendarDate ?? ""),
        origin,
        origin,
        { examDate },
      );
      expect(label ?? "").not.toMatch(/Hafta/);
    }
    // Final adımları geçmiş bir güne yazılmaz.
    expect(dated.every((node) => (node.sessionMeta?.calendarDate ?? origin) >= origin)).toBe(true);
  });
});

describe("Paket I · bitmiş adım 'Tamamlandı · <tarih>'", () => {
  it("bitmiş adım Bugün/Yarın demez", () => {
    const today = "2026-10-29";
    expect(pathNodeWhenLabel({ status: "done", calendarDate: "2026-10-30" }, { today, doneOn: "2026-10-29" })).toBe(
      "Tamamlandı · 29 Eki",
    );
    expect(pathNodeWhenLabel({ status: "done", calendarDate: "2026-10-30" }, { today })).toBe("Tamamlandı");
    expect(pathNodeWhenLabel({ status: "locked", calendarDate: "2026-10-30" }, { today })).toBe("Yarın");
    expect(pathNodeWhenLabel({ status: "ready", calendarDate: "2026-10-29" }, { today })).toBe("Bugün");
    expect(sectionDoneLabel(["2026-10-29", "2026-10-29"])).toBe("29 Eki");
    expect(sectionDoneLabel(["2026-10-30", "2026-10-29"])).toBe("29 Eki – 30 Eki");
  });

  it("yol bitiş gününü kayıttan okur ve etiketi tek yardımcıdan yazar", () => {
    const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
    expect(home).toContain("pathNodeWhenLabel(");
    expect(home).toContain("doneOn: doneOn[node.id]");
    expect(home).toContain("sectionDoneLabel(");
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/page.tsx", "utf8");
    expect(page).toContain("nodeDoneOn[id] = istanbulDay(at)");
    expect(page).toContain("nodeDoneOn={nodeDoneOn}");
  });
});

describe("Paket I · sınav saati ve yeri", () => {
  it("tercihlerde durur; bozuk değer sessizce yok sayılır; ayarlar kaydı silmez", () => {
    expect(parseLearningPreferences({ examTime: "10:00", examPlace: "  Amfi   2 " })).toMatchObject({
      examTime: "10:00",
      examPlace: "Amfi 2",
    });
    const bad = parseLearningPreferences({ examTime: "25:00", examPlace: "   " });
    expect(bad.examTime).toBeUndefined();
    expect(bad.examPlace).toBeUndefined();
    expect(parseLearningPreferences({ examTime: "10.00" }).examTime).toBeUndefined();
    // Eski kayıt (saat yok) aynı kalır.
    expect(parseLearningPreferences({ language: "tr" })).not.toHaveProperty("examTime");
    expect(examTimeFromPreferences(null)).toEqual({ time: null, place: null });
  });

  it("planda ve Takvimim'de saatle görünür", () => {
    expect(examDayLabel({ date: "2026-10-31", time: "10:00" })).toBe("31 Eki 10:00 · Sınav");
    expect(examDayLabel({ date: "2026-10-31", time: "10:00", place: "Amfi 2" })).toBe("31 Eki 10:00 · Sınav · Amfi 2");
    expect(examDayLabel({ date: "2026-10-31" })).toBe("31 Eki · Sınav");
    const items = buildCalendarItems(
      [],
      [
        { id: "p1", title: "Fizik vizesi", exam_type: "Fizik", exam_date: "2026-10-31", learning_preferences: { examTime: "10:00", examPlace: "Amfi 2" } },
        { id: "p2", title: "Tarih", exam_type: "Tarih", exam_date: "2026-11-20", learning_preferences: {} },
      ],
    );
    expect(items.find((item) => item.prepId === "p1")).toMatchObject({ time: "10:00", place: "Amfi 2" });
    expect(items.find((item) => item.prepId === "p2")?.time).toBeUndefined();

    const create = readFileSync("src/app/api/learning/exam-prep/create/route.ts", "utf8");
    expect(create).toContain("examTime: z.string().regex(EXAM_TIME_PATTERN).optional()");
    const settings = readFileSync("src/app/api/learning/exam-prep/settings/route.ts", "utf8");
    expect(settings).toContain("examTime: z.string().regex(EXAM_TIME_PATTERN).optional()");
    const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
    expect(wizard).toContain('type="time"');
    expect(wizard).toContain("examTime: parseExamTime(examTime)");
    const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
    expect(home).toContain("examDayLabel({ date: examDate, time: examTime, place: examPlace })");
    const calendarPage = readFileSync("src/app/takvimim/page.tsx", "utf8");
    expect(calendarPage).toContain("learning_preferences");
    const calendarView = readFileSync("src/components/parity/calendar-view.tsx", "utf8");
    expect(calendarView).toContain("examDayLabel(");
  });
});

describe("Paket I · bayram tablosu olmayan yıl", () => {
  it("2027 sonrası dinî bayram yoksa sessiz kalır; sabit tatiller çalışır", () => {
    expect(turkishHolidayOn("2028-04-23")).toBe("Ulusal Egemenlik ve Çocuk Bayramı");
    expect(turkishHolidayOn("2028-02-26")).toBeNull();
    const runs = holidayRunsBetween("2028-01-01", "2028-12-31");
    expect(runs.map((run) => run.name)).toEqual([
      "Yılbaşı",
      "Ulusal Egemenlik ve Çocuk Bayramı",
      "Emek ve Dayanışma Günü",
      "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
      "Demokrasi ve Millî Birlik Günü",
      "Zafer Bayramı",
      "Cumhuriyet Bayramı",
    ]);
    // Uzun plan 2028'e uzansa da kurulur.
    const plan = buildExamScheduleV2({
      daysToExam: 500,
      dailyMinutes: 45,
      studyDays: EVERY_DAY,
      topics: MIXED_TOPICS.slice(0, 4),
      fromDate: new Date("2027-09-01T09:00:00+03:00"),
    });
    expect(plan.studyDayDates[plan.studyDayDates.length - 1]! > "2028-12-01").toBe(true);
  });
});
