import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/generate", () => ({ generateJson: vi.fn(), isPremiumUser: vi.fn(async () => false) }));
vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_LARGE_MODEL: "gpt-6-luna",
    OPENAI_OUTLINE_FALLBACK_MODEL: "gpt-4.1-mini",
  },
}));

import { lessonStepCounter } from "@/lib/learning/activity-duration";
import { plannedScreensOf } from "@/lib/learning/teacher-lesson-run";
import {
  examElapsedSeconds,
  formatElapsedSeconds,
  mockElapsedLabel,
  recordedElapsedSeconds,
} from "@/lib/learning/mock-exam/time-limit";
import {
  dedupeTrueFalse,
  sameTrueFalseFact,
  trueFalseExplanation,
  TF_CORRECTION_PREFIX,
} from "@/lib/learning/true-false-quality";
import { teacherTrueFalseLoop, TF_DUPLICATE_ISSUE } from "@/lib/learning/teacher-practice";
import {
  checkpointsFromEvents,
  detectCheckpointDates,
  HOLIDAY_BADGE,
  mergeCheckpoints,
  turkishHolidayOn,
} from "@/lib/learning/tr-calendar";
import {
  buildExamScheduleV2,
  redistributeRemainingSchedule,
  scheduleSessionsToNodeDrafts,
  studyDayBudgets,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { mergeStudyPathTemplate } from "@/lib/learning/exam-prep-plan";
import { inFinalSection } from "@/lib/learning/final-block";
import { buildPageIndexCorpus, OUTLINE_INDEX_MIN_PAGES, pageIndexLine } from "@/lib/documents/outline-page-index";
import { buildMaterialCorpus, prepareOutlineMaterial } from "@/lib/documents/outline-oneshot";
import { installPlatform, installSteps } from "@/lib/pwa/install-platform";
import { OCR_JPEG_QUALITY } from "@/lib/documents/render-pdf-pages";
import manifest from "@/app/manifest";

/* ───────────── 1. Taranmış/büyük belge hızı ───────────── */

const CHAPTERS = ["HÜCRE ZARI", "MİTOZ BÖLÜNME", "MAYOZ BÖLÜNME", "KALITIM İLKELERİ", "EKOSİSTEM DENGESİ"];

describe("Paket B · 1 büyük belgenin konu haritası sayfa dizini okur", () => {
  const book = (pages: number) =>
    Array.from({ length: pages }, (_, i) => ({
      pageNumber: i + 1,
      text:
        `${i % 6 === 0 ? `${Math.floor(i / 6) + 1}. ${CHAPTERS[Math.floor(i / 6) % CHAPTERS.length]}\n` : ""}` +
        `Bu sayfa ${i + 1} numaralı sayfadır. `.repeat(60) +
        `Sayfanın son cümlesi ${i + 1}.`,
    }));

  it("300 sayfada model ham metnin dörtte birinden azını okur, her sayfa dizinde", () => {
    const files = [{ fileName: "kitap.pdf", pages: book(300) }];
    const full = buildMaterialCorpus(files);
    const index = buildPageIndexCorpus(files);
    expect(index.length).toBeLessThan(full.length / 4);
    for (const page of [1, 150, 300]) expect(index).toContain(`[d1 s.${page}]`);
    // Başlık, baş ve son cümle, yoğunluk: modelin konu sınırını bulduğu bilgi.
    expect(index).toMatch(/\[d1 s\.1\] (?:dolu|çok dolu) \(\d+ krk\) \| başlık: [^|]*Hücre zarı/u);
    expect(index).toMatch(/\[d1 s\.7\] (?:dolu|çok dolu) \(\d+ krk\) \| başlık: [^|]*Mitoz bölünme/u);
    expect(index).toMatch(/\[d1 s\.300\][^\n]*\| son: …[^\n|]*Sayfanın son cümlesi 300\.$/mu);
  });

  it("100 sayfa ve üstü dizinli, altı ham metin; temellendirme yine tam metne bakar", () => {
    const small = prepareOutlineMaterial([{ fileName: "not.pdf", pages: book(OUTLINE_INDEX_MIN_PAGES - 1) }]);
    const large = prepareOutlineMaterial([{ fileName: "kitap.pdf", pages: book(OUTLINE_INDEX_MIN_PAGES) }]);
    expect(small.indexed).toBe(false);
    expect(large.indexed).toBe(true);
    expect(large.corpus.startsWith("SAYFA DİZİNİ")).toBe(true);
    expect(large.validation.pageTexts!.size).toBe(OUTLINE_INDEX_MIN_PAGES);
    expect([...large.validation.pageTexts!.values()][0]).toContain("Bu sayfa 1 numaralı sayfadır.");
  });

  it("boş sayfa dizine satır vermez; kısa sayfa tam metniyle girer", () => {
    expect(pageIndexLine("d1", { pageNumber: 4, text: "   " })).toBeNull();
    expect(pageIndexLine("d1", { pageNumber: 5, text: "Kısa bir not." })).toBe("[d1 s.5] seyrek (13 krk) | metin: Kısa bir not.");
  });

  it("taranmış sayfa OCR'a JPEG gider (PNG'den ~5 kat hızlı kodlama)", () => {
    const render = readSource("src/lib/documents/render-pdf-pages.ts");
    expect(render).toContain('canvas.toBuffer("image/jpeg", OCR_JPEG_QUALITY)');
    expect(OCR_JPEG_QUALITY).toBeGreaterThanOrEqual(85);
    const ingestion = readSource("src/lib/documents/pdf-ingestion.ts");
    expect(ingestion).toContain("extractImageText(image, mime,");
    expect(ingestion).not.toContain('"image/png", { deadlineMs');
  });
});

/* ───────────── 2. Adım sayacı ve deneme süresi ───────────── */

/*
  29 Ekim 2026 (Paket H): "payda baştan sabit = yazarın planı + 2" tasarımı değişti. Plan ekran
  sayar, adım listesi ekran dışı adımları ve onarım ekranlarını da içerir; her tahmin bir noktada
  yalanlanıyordu. Yazım sürerken payda YOK (çıplak "N"), mühürde payda ilk mühürlü toplamda kilitli.
*/
describe("Paket B · 2 adım sayacı sıçramaz", () => {
  it("yazım sürerken payda yok: 2 → 4 → 8 yazılırken etiket çıplak, çubuk belirsiz", () => {
    const seen = [2, 4, 8].map((written) =>
      lessonStepCounter({ index: written === 8 ? 2 : 0, writtenSteps: written, building: true }),
    );
    expect(seen.map((c) => c.label)).toEqual(["1", "1", "3"]);
    expect(seen.every((c) => c.indeterminate)).toBe(true);
    expect(seen.every((c) => !c.label.includes("/"))).toBe(true);
  });

  it("yazım bitince gerçek payda; kilitli toplam sonradan büyüyen payload'u görmez", () => {
    expect(lessonStepCounter({ index: 3, writtenSteps: 8, building: false }).label).toBe("4 / 8");
    const locked = lessonStepCounter({ index: 0, writtenSteps: 10, building: false, lockedTotal: 9 });
    expect(locked.label).toBe("1 / 9");
    expect(locked.max).toBe(9);
    expect(locked.indeterminate).toBe(false);
    // Kilitli toplamın ötesine geçen adım paydayı aşmaz.
    expect(lessonStepCounter({ index: 9, writtenSteps: 10, building: false, lockedTotal: 9 }).label).toBe("9 / 9");
  });

  it("plan başlıktan okunur (kayıt amaçlı); bozuk değer yok sayılır", () => {
    expect(plannedScreensOf({ title: "Ders", plannedScreens: 7 })).toBe(7);
    expect(plannedScreensOf({ title: "Ders", plannedScreens: "6" })).toBe(6);
    expect(plannedScreensOf({ title: "Ders", plannedScreens: 0 })).toBeUndefined();
    expect(plannedScreensOf({ title: "Ders", plannedScreens: "çok" })).toBeUndefined();
    expect(plannedScreensOf(null)).toBeUndefined();
  });
});

describe("Paket B · 2 deneme süresi gerçek geçen zamandan", () => {
  it("6 dk 24 sn süren deneme '6 dk 24 sn' görünür, 82 sn '1 dk' değil", () => {
    expect(formatElapsedSeconds(384)).toBe("6 dk 24 sn");
    expect(formatElapsedSeconds(82)).toBe("1 dk 22 sn");
    expect(formatElapsedSeconds(45)).toBe("45 sn");
    expect(formatElapsedSeconds(3_900)).toBe("1 sa 5 dk");
    expect(formatElapsedSeconds(null)).toBe("—");
  });

  it("kayıt sunucu saatinden: gönderim − başlangıç; başlangıç yoksa istemcinin ölçümü", () => {
    const started = "2026-10-27T19:30:51.048Z";
    const submitted = Date.parse("2026-10-27T19:37:15.048Z");
    expect(examElapsedSeconds(started, submitted)).toBe(384);
    expect(recordedElapsedSeconds({ startedAt: started, submittedAt: submitted, clientSeconds: 30 })).toBe(384);
    expect(recordedElapsedSeconds({ startedAt: null, submittedAt: submitted, clientSeconds: 410.4 })).toBe(410);
    expect(recordedElapsedSeconds({ startedAt: null, submittedAt: submitted, clientSeconds: null })).toBeNull();
    // Gönderim başlangıçtan önceyse ya da 12 saati geçiyorsa ölçüm yok.
    expect(examElapsedSeconds(started, Date.parse("2026-10-27T19:00:00Z"))).toBeNull();
    expect(examElapsedSeconds(started, Date.parse("2026-10-29T19:00:00Z"))).toBeNull();
  });

  it("sonuç ve inceleme ekranı önce kayıtlı saniyeyi gösterir", () => {
    expect(mockElapsedLabel("2026-10-25T10:00:00Z", "2026-10-25T10:01:30Z", 384)).toBe("6 dk 24 sn");
    expect(mockElapsedLabel("2026-10-25T10:00:00Z", "2026-10-25T10:01:30Z")).toBe("1 dk 30 sn");
    const grade = readSource("src/lib/learning/mock-exam/grade-exam.ts");
    expect(grade).toMatch(/duration_seconds: recordedElapsedSeconds\(\{/);
    expect(grade.indexOf("const submittedAt = Date.now();")).toBeLessThan(grade.indexOf("duration_seconds:"));
    const review = readSource("src/app/deneme-sinavlari/[prepId]/deneme/[examId]/incele/page.tsx");
    expect(review).toContain("Çözüm süresi:");
    const runner = readSource("src/components/parity/exam-runner.tsx");
    expect(runner).toContain("elapsedSeconds: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))");
  });
});

/* ───────────── 3. Doğru/yanlış kalitesi ───────────── */

const tf = (text: string, correct: boolean, extra: Partial<{ correctedStatement: string; misconceptionTag: string; explanation: string }> = {}) => ({
  text,
  correct,
  explanation: extra.explanation ?? "Kaynaktaki kural bunu söyler, ayrıntısıyla.",
  ...(extra.correctedStatement ? { correctedStatement: extra.correctedStatement } : {}),
  misconceptionTag: extra.misconceptionTag ?? `etiket ${text.length}`,
});

describe("Paket B · 3 doğru/yanlış setinde çift ve ters önerme yok", () => {
  it("olumsuzlukla ters çevrilmiş aynı bilgi çifttir", () => {
    expect(
      sameTrueFalseFact(
        tf("Mutlak butlan emredici kurala aykırı işlemlerde görülür.", true),
        tf("Mutlak butlan emredici kurala aykırı işlemlerde görülmez.", false, { correctedStatement: "Mutlak butlan emredici kurala aykırı işlemlerde görülür." }),
      ),
    ).toBe(true);
  });

  it("yanlış önermenin doğru hâli setteki doğru önermeyse çifttir", () => {
    expect(
      sameTrueFalseFact(
        tf("Mitoz eşeyli üremenin temelidir.", false, { correctedStatement: "Mitoz eşeysiz üremenin temelidir." }),
        tf("Mitoz eşeysiz üremenin temelidir.", true),
      ),
    ).toBe(true);
  });

  it("aynı ayırt edici yanılgı etiketi çifttir; farklı alt bilgiler değildir", () => {
    expect(
      sameTrueFalseFact(
        tf("Sol ventrikül sistemik dolaşıma kan pompalar.", true, { misconceptionTag: "sağ sol ventrikül karışıklığı" }),
        tf("Sağ atriyum oksijenli kanı alır.", false, { correctedStatement: "Sol atriyum oksijenli kanı alır.", misconceptionTag: "sağ sol ventrikül karışıklığı" }),
      ),
    ).toBe(true);
    expect(
      sameTrueFalseFact(
        tf("Sol ventrikül sistemik dolaşıma kan pompalar.", true),
        tf("Sağ ventrikül pulmoner dolaşıma kan pompalar.", true),
      ),
    ).toBe(false);
    // Sayısı farklı iki bilgi ayrıdır.
    expect(sameTrueFalseFact(tf("Normal nabız dakikada 60-100 atımdır.", true), tf("Normal solunum dakikada 12-20 kezdir.", true))).toBe(false);
  });

  it("8'lik set: her önerme başka bir alt bilgiyi yoklar", () => {
    const set = [
      tf("Yokluk kurucu unsuru olmayan işlemde görülür.", true),
      tf("Yokluk kurucu unsuru olmayan işlemde görülmez.", false, { correctedStatement: "Yokluk kurucu unsuru olmayan işlemde görülür." }),
      tf("Mutlak butlanı herkes ileri sürebilir.", true),
      tf("İptal edilebilirlikte işlem başlangıçta geçerlidir.", true),
      tf("Nisbi butlan yalnız korunan tarafça ileri sürülür.", true),
      tf("Hukuki yaptırım maddi zorlamaya dayanır.", true),
      tf("Ahlak kuralları devlet zoruyla desteklenir.", false, { correctedStatement: "Ahlak kuralları devlet zoruyla desteklenmez." }),
      tf("Örf ve adet kuralları yazılı olmak zorundadır.", false, { correctedStatement: "Örf ve adet kuralları yazılı olmak zorunda değildir." }),
      tf("Ahlak kuralları devlet zoruyla desteklenmez.", true),
    ];
    const kept = dedupeTrueFalse(set);
    expect(kept).toHaveLength(7);
    for (let i = 0; i < kept.length; i += 1) {
      for (let j = i + 1; j < kept.length; j += 1) expect(sameTrueFalseFact(kept[i]!, kept[j]!)).toBe(false);
    }
  });

  it("motor çifti eksik sayar, eksik kadar yenisini ister; set yine 8", async () => {
    const first = [
      tf("Yokluk kurucu unsuru olmayan işlemde görülür.", true),
      tf("Yokluk kurucu unsuru olmayan işlemde görülmez.", false, { correctedStatement: "Yokluk kurucu unsuru olmayan işlemde görülür." }),
      tf("Mutlak butlanı herkes ileri sürebilir.", true),
      tf("İptal edilebilirlikte işlem başlangıçta geçerlidir.", true),
      tf("Nisbi butlan yalnız korunan tarafça ileri sürülür.", true),
      tf("Hukuki yaptırım maddi zorlamaya dayanır.", true),
      tf("Ahlak kuralları devlet zoruyla desteklenir.", false, { correctedStatement: "Ahlak kuralları devlet zoruyla desteklenmez." }),
      tf("Ahlak kuralları devlet zoruyla desteklenmez.", true),
      tf("Örf ve adet kuralları yazılı olmak zorundadır.", false, { correctedStatement: "Örf ve adet kuralları yazılı olmak zorunda değildir." }),
      tf("Din kuralları uhrevi yaptırıma bağlanır.", true),
    ];
    const second = [
      tf("Görgü kurallarının yaptırımı toplumsal kınamadır.", true),
      tf("Hukuk kuralları yalnız ceza yaptırımı içerir.", false, { correctedStatement: "Hukuk kuralları tazminat ve hükümsüzlük de içerir." }),
    ];
    let call = 0;
    const ask = vi.fn(async () => ({ items: call++ === 0 ? first : second }));
    const loop = await teacherTrueFalseLoop(ask, { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "…" }], count: 8 });
    expect(loop.items).toHaveLength(8);
    expect(loop.rejected.filter((row) => row.problems.includes(TF_DUPLICATE_ISSUE))).toHaveLength(2);
    for (let i = 0; i < loop.items.length; i += 1) {
      for (let j = i + 1; j < loop.items.length; j += 1) expect(sameTrueFalseFact(loop.items[i]!, loop.items[j]!)).toBe(false);
    }
    // Yanlış önermenin açıklaması "✏️ Doğrusu:" ile başlar.
    for (const item of loop.items.filter((row) => !row.correct)) expect(item.explanation.startsWith(TF_CORRECTION_PREFIX)).toBe(true);
    expect(loop.mixed).toBe(true);
  });

  it("açıklama biçimi: doğru hâl başa, doğru önermeye dokunulmaz, iki kez eklenmez", () => {
    const wrong = tf("Ahlak kuralları devlet zoruyla desteklenir.", false, {
      correctedStatement: "Ahlak kuralları devlet zoruyla desteklenmez",
      explanation: "Ahlakın yaptırımı vicdandır.",
    });
    expect(trueFalseExplanation(wrong)).toBe("✏️ Doğrusu: Ahlak kuralları devlet zoruyla desteklenmez. Ahlakın yaptırımı vicdandır.");
    expect(trueFalseExplanation({ ...wrong, explanation: trueFalseExplanation(wrong) })).toBe(trueFalseExplanation(wrong));
    expect(trueFalseExplanation({ ...wrong, explanation: "Doğrusu: vicdani yaptırım." })).toBe("✏️ Doğrusu: vicdani yaptırım.");
    expect(trueFalseExplanation(tf("Din kuralları uhrevi yaptırıma bağlanır.", true, { explanation: "Uhrevi." }))).toBe("Uhrevi.");
  });

  it("istem çifti yasaklar; ekran büyük odak kartı ve ← / → / Enter akışı", () => {
    const practice = readSource("src/lib/learning/teacher-practice.ts");
    expect(practice).toContain("ÇİFT YOK");
    expect(practice).toContain("'✏️ Doğrusu: <doğru hâli>'");
    const card = readSource("src/components/learning/true-false-focus-card.tsx");
    expect(card).toMatch(/key === "arrowleft" \|\| key === "d"/);
    expect(card).toMatch(/key === "arrowright" \|\| key === "y"/);
    expect(card).toMatch(/key === "enter"/);
    const session = readSource("src/components/parity/exam-node-session.tsx");
    expect(session).toContain("<TrueFalseFocusCard");
    const studio = readSource("src/components/learning/studio/true-false-studio.tsx");
    expect(studio).toContain("useTrueFalseKeys(");
  });
});

/* ───────────── 4. Takvim: resmî tatil ve ara sınav ───────────── */

const topics = (n: number): ScheduleTopicInput[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, title: `Konu ${i + 1}`, pageNumbers: [i * 3 + 1, i * 3 + 2, i * 3 + 3] }));

describe("Paket B · 4 resmî tatiller", () => {
  it("sabit ve dinî tatiller tanınır", () => {
    expect(turkishHolidayOn("2026-10-29")).toBe("Cumhuriyet Bayramı");
    expect(turkishHolidayOn("2027-01-01")).toBe("Yılbaşı");
    expect(turkishHolidayOn("2027-04-23")).toBe("Ulusal Egemenlik ve Çocuk Bayramı");
    expect(turkishHolidayOn("2027-05-01")).toBe("Emek ve Dayanışma Günü");
    expect(turkishHolidayOn("2026-05-19")).toBe("Atatürk'ü Anma, Gençlik ve Spor Bayramı");
    // 2027'de 19 Mayıs Kurban Bayramı'nın son günü: dinî bayramın adı gösterilir.
    expect(turkishHolidayOn("2027-05-19")).toBe("Kurban Bayramı");
    expect(turkishHolidayOn("2027-07-15")).toBe("Demokrasi ve Millî Birlik Günü");
    expect(turkishHolidayOn("2027-08-30")).toBe("Zafer Bayramı");
    expect(turkishHolidayOn("2027-03-09")).toBe("Ramazan Bayramı");
    expect(turkishHolidayOn("2027-05-16")).toBe("Kurban Bayramı");
    expect(turkishHolidayOn("2026-10-28")).toBeNull();
    expect(HOLIDAY_BADGE).toBe("🇹🇷 Resmî Tatil (Esnek Gün)");
  });

  it("tatil esnek gün: bütçe yarıya iner, yük komşu günlere kayar; deneme günü tam kalır", () => {
    expect(studyDayBudgets(["2026-10-28", "2026-10-29", "2026-10-30"], 45)).toEqual([45, 23, 45]);
    expect(studyDayBudgets(["2026-10-28", "2026-10-29"], 45)).toEqual([45, 45]);
    const plan = buildExamScheduleV2({
      daysToExam: 10,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: topics(6),
      fromDate: new Date("2026-10-27T09:00:00Z"),
    });
    expect(plan.availableMinutes).toBe(9 * 45 + 23);
    const onHoliday = plan.sessions.filter((s) => s.calendarDate === "2026-10-29");
    const budgeted = onHoliday.filter((s) => s.kind !== "true_false" && !["podcast", "qa", "oral"].includes(s.kind));
    expect(budgeted.reduce((sum, s) => sum + s.durationMinutes, 0)).toBeLessThanOrEqual(23);
    for (const session of onHoliday) expect(session.holiday).toBe("Cumhuriyet Bayramı");
    expect(plan.sessions.filter((s) => s.calendarDate !== "2026-10-29").every((s) => !s.holiday)).toBe(true);
  });

  it("yol ve Takvimim rozeti gösterir", () => {
    const home = readSource("src/components/parity/exam-prep-home.tsx");
    expect(home).toContain("{HOLIDAY_BADGE}");
    const calendar = readSource("src/components/parity/calendar-view.tsx");
    expect(calendar).toContain("cp-cal-day--holiday");
  });
});

describe("Paket B · 4 ara sınav öncesi kontrol adımı", () => {
  const window = { from: "2026-10-28", examDate: "2026-12-20" };

  it("belgede ara sınav sözcüğü ve tarih aynı satırda geçince yakalanır", () => {
    const text = [
      "DERS İZLENCESİ",
      "Vize: 12 Kasım 2026, saat 10.00",
      "Quiz 2 — 05.12.2026",
      "Kısa sınav 3 Aralık",
      "Final sınavı: 20 Aralık 2026",
      "Bu hafta 14 Kasım'da laboratuvar var.",
      "Ara sınav 01.01.2027",
    ].join("\n");
    expect(detectCheckpointDates(text, window)).toEqual([
      { date: "2026-11-12", label: "Vize" },
      { date: "2026-12-03", label: "Quiz" },
      { date: "2026-12-05", label: "Quiz" },
    ]);
  });

  it("öğrencinin Takvimim etkinliği de sayılır; aynı gün bir kez", () => {
    const events = [
      { title: "Fizyoloji vizesi", event_date: "2026-11-12" },
      { title: "Doğum günü", event_date: "2026-11-20" },
      { title: "Biyokimya quiz", event_date: "2026-11-26" },
    ];
    const fromEvents = checkpointsFromEvents(events, window);
    expect(fromEvents.map((c) => c.date)).toEqual(["2026-11-12", "2026-11-26"]);
    const merged = mergeCheckpoints(fromEvents, [{ date: "2026-11-12", label: "Vize" }]);
    expect(merged).toEqual([
      { date: "2026-11-12", label: "Fizyoloji vizesi" },
      { date: "2026-11-26", label: "Biyokimya quiz" },
    ]);
  });

  it("vizeden bir gün önce 'Ara Deneme / Kontrol' adımı konur, yolun ortasında kalır", () => {
    const plan = buildExamScheduleV2({
      daysToExam: 25,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: topics(8),
      fromDate: new Date("2026-11-01T09:00:00Z"),
      checkpoints: [{ date: "2026-11-12", label: "Vize" }],
    });
    const check = plan.sessions.find((s) => s.checkpoint);
    expect(check).toMatchObject({ calendarDate: "2026-11-11", kind: "focused", checkpoint: "Vize", checkpointDate: "2026-11-12" });
    // Kontrol, o güne kadar dersi işlenmiş son konunun ardından: sonraki konuların derslerinden önce.
    const order = plan.sessions.map((s) => s.sortOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const index = plan.sessions.indexOf(check!);
    expect(plan.sessions.slice(index + 1).some((s) => s.role === "learn")).toBe(true);
    expect(plan.checkpoints).toEqual([{ date: "2026-11-12", label: "Vize" }]);

    const drafts = mergeStudyPathTemplate(scheduleSessionsToNodeDrafts(plan.sessions));
    const node = drafts.find((d) => d.meta?.checkpoint);
    expect(node?.title).toBe("Ara Deneme / Kontrol · Vize");
    expect(inFinalSection("focused", node!.meta)).toBe(false);
    // Şablonun finaldeki odaklı pratiği yine kurulur.
    expect(drafts.filter((d) => d.kind === "focused" && !d.meta?.checkpoint)).toHaveLength(1);
  });

  it("ara sınavdan önce ders yoksa ya da tarih geçtiyse adım konmaz; yeniden planlama korur", () => {
    const base = {
      daysToExam: 25,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: topics(8),
      fromDate: new Date("2026-11-01T09:00:00Z"),
    };
    expect(buildExamScheduleV2({ ...base, checkpoints: [{ date: "2026-11-01", label: "Quiz" }] }).sessions.some((s) => s.checkpoint)).toBe(false);
    const previous = buildExamScheduleV2({ ...base, checkpoints: [{ date: "2026-11-20", label: "Vize" }] });
    const rebuilt = redistributeRemainingSchedule({
      previous,
      completed: [],
      fromDate: new Date("2026-11-03T09:00:00Z"),
      dailyMinutes: 45,
      studyDays: base.studyDays,
      daysToExam: 23,
      topics: base.topics,
    });
    expect(rebuilt.sessions.filter((s) => s.checkpoint)).toHaveLength(1);
    expect(rebuilt.sessions.find((s) => s.checkpoint)!.calendarDate).toBe("2026-11-19");
  });
});

/* ───────────── 5. PWA ───────────── */

describe("Paket B · 5 telefona uygulama olarak kurulum", () => {
  it("manifest tam ekran, simgeler 192/512 ve maskeli", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.icons?.map((icon) => icon.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    expect(m.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("iOS ana ekran etiketleri ve simge kök yerleşimde", () => {
    const layout = readSource("src/app/layout.tsx");
    expect(layout).toMatch(/appleWebApp: \{\s*capable: true/);
    expect(layout).toContain('"apple-mobile-web-app-capable": "yes"');
    expect(readSource("src/app/apple-icon.tsx")).toContain("width: 180");
  });

  it("platform tanınır; iOS'ta Safari'nin Ana Ekrana Ekle adımları", () => {
    expect(installPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("ios");
    expect(installPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile/15E148")).toBe("ios-other");
    expect(installPlatform("Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36")).toBe("android");
    expect(installPlatform("Mozilla/5.0 (iPhone) Instagram 300.0")).toBe("webview");
    expect(installPlatform("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0")).toBe("desktop");
    expect(installSteps("ios").join(" ")).toContain("Ana Ekrana Ekle");
    expect(installSteps("android").join(" ")).toContain("Uygulamayı yükle");
  });

  it("/mobil-uygulama başlığı ve beforeinstallprompt tetiği", () => {
    const page = readSource("src/app/mobil-uygulama/page.tsx");
    expect(page).toContain("📲 Tek Tıkla Telefonuna Uygulama Olarak Kur (iOS & Android)");
    const install = readSource("src/components/pwa/install-app.tsx");
    expect(install).toContain('addEventListener("beforeinstallprompt"');
    expect(install).toContain("await prompt.prompt()");
  });
});
