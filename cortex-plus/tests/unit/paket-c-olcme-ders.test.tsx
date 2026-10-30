// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  sanitizeStudentCopy,
  studentOutputPayload,
  studentOutputText,
  studentSafeText,
} from "@/lib/learning/student-output-firewall";
import { quizStructureIssues, stepsAnswerMismatch } from "@/lib/learning/teacher-quiz";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { lessonOptionCountLine, screenStructureIssues, teacherUserPrompt } from "@/lib/learning/teacher-lesson";
import { DiagramCard, labelStyle, labelTiers, estimateLabelWidth, CHAR_W } from "@/components/parity/diagram-card";
import { STALE_CREATING_MS, waitForPrefetchReady } from "@/lib/learning/lesson-prefetch";
import { MASTERY_STATE_LABEL, topicMasteryView, type TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import { topicState } from "@/lib/learning/readiness-screen";
import { resultStages, readTopicGain } from "@/lib/learning/result-stages";
import { isFigurePage } from "@/lib/learning/source-preview";
import { buildPrepProgressView } from "@/lib/learning/prep-progress-view";

const read = (path: string) => readFileSync(path, "utf8");

/* ───────────── Tek metin süzgeci ───────────── */

describe("Paket C · öğrenci metninin tek süzgeci", () => {
  it("iç etiketler, ürün adları ve kalıp cümleler öğrenciye çıkmaz", () => {
    const dirty = [
      "SINAV MÜFREDATI TAMAMLAMASI: Hücre zarı seçici geçirgendir (core).",
      "NEDEN BÖYLE? Çünkü fosfolipit çift katlıdır. Readiness: developing.",
      "Bu konu sınav kapsamı dışındadır. Kayıtlı sorulardan. Yeni üretim yok.",
      "Ders: Biyoloji 9 Dönem 2026 Güz",
      "Değer burada görünmediği için belirlenemez. Doğru cevap C'dir.",
      "Kurucu hesabı için not. Sonuç şöyle hesaplanır:",
    ].join("\n");
    const clean = studentOutputText(dirty);
    for (const leak of [
      "MÜFREDATI TAMAMLAMASI",
      "NEDEN BÖYLE",
      "(core)",
      "Readiness",
      "developing",
      "kapsamı dışındadır",
      "Kayıtlı sorulardan",
      "Dönem 2026",
      "görünmediği için",
      "cevap C'dir",
      "Kurucu hesabı",
      "şöyle hesaplanır:",
    ]) {
      expect(clean).not.toContain(leak);
    }
    expect(clean).toContain("Hücre zarı seçici geçirgendir");
    expect(clean).toContain("fosfolipit çift katlıdır");
  });

  it("emerging 'Gelişiyor' olur; 'İpucu,' öneki düşer, not kutusunun ortasındaki 'İpucu:' kalır", () => {
    expect(studentOutputText("Durum: emerging")).toBe("Durum: Gelişiyor");
    expect(studentOutputText("İpucu, tabloyu satır satır oku.")).toBe("tabloyu satır satır oku.");
    expect(studentOutputText("İpucu: önce birimi çevir.")).toBe("önce birimi çevir.");
    // 26 Ekim 2026 bekçisi: ham "İpucu:" öneki metnin ortasında da kalmaz.
    expect(studentOutputText("Önce birimi çevir. İpucu: sonra topla.")).toBe("Önce birimi çevir. sonra topla.");
  });

  it("podcast satırındaki konuşmacı adı ve uydurma anı düşer", () => {
    expect(studentOutputText("Ada: Bugün hücre zarını konuşuyoruz.")).toBe("Bugün hücre zarını konuşuyoruz.");
    expect(studentOutputText("ÖĞRETMEN: Not al.\nEce: Tamam.")).toBe("Not al.\nTamam.");
    expect(studentOutputText("Deniz: 12 Kasım'da sınav var.")).toBe("12 Kasım'da sınav var.");
    const memory = studentOutputText("Osmoz suyun geçişidir. Geçen gün denemede bunu üç öğrenci karıştırdı. Difüzyon ise çözünenin geçişidir.");
    expect(memory).toBe("Osmoz suyun geçişidir. Difüzyon ise çözünenin geçişidir.");
    // Metnin ortasındaki ad bir isimdir, konuşmacı öneki değil.
    expect(studentOutputText("Ada ve Kerem: iki arkadaş.")).toBe("Ada ve Kerem: iki arkadaş.");
  });

  it("eski adlar aynı süzgeci çağırır; payload'da issues düşer, qualityReport yalnız istenince kalır", () => {
    const text = "Readiness (bonus) metin";
    expect(studentSafeText(text)).toBe(studentOutputText(text));
    expect(sanitizeStudentCopy(text)).toBe(studentOutputText(text));
    const payload = studentOutputPayload({
      lesson: { title: "Ders (core)", issues: ["x"], screens: [{ text: "ÖĞRETMEN: Başlıyoruz." }] },
      qualityReport: { score: 3 },
      disputes: [],
    });
    expect(payload).toEqual({ lesson: { title: "Ders", screens: [{ text: "Başlıyoruz." }] } });
    expect(studentOutputPayload({ qualityReport: { score: 3 } }, { keepQualityReport: true })).toEqual({ qualityReport: { score: 3 } });
  });

  it("sohbet cevabı, Araçlar çıktısı ve düğüm kaydı aynı süzgeçten geçer", () => {
    expect(read("src/app/api/ai/chat/route.ts")).toContain("const studentFacing = studentOutputText(studentFacingRaw);");
    expect(read("src/components/learning/studio/studio-shared.tsx")).toContain("data: studentOutputPayload(payload)");
    expect(read("src/app/api/learning/exam-prep/node/route.ts")).toContain("return studentSafePayload(");
    expect(read("src/lib/learning/student-safe-text.ts")).toContain('from "@/lib/learning/student-output-firewall"');
    expect(read("src/lib/learning/student-copy.ts")).toContain('from "@/lib/learning/student-output-firewall"');
  });
});

/* ───────────── Ölçme: çözüm adımı ↔ doğru şık ───────────── */

const mcq = (over: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({
    text: "Bir dikdörtgenin kenarları 3 cm ve 4 cm ise köşegeni kaç cm'dir?",
    options: ["5 cm", "7 cm", "12 cm", "25 cm"],
    correct: ["5 cm"],
    multi: false,
    explanation: "Pisagor: 3² + 4² = 25, karekökü 5.",
    optionWhy: ["Doğru", "Toplam", "Alan", "Karekök alınmamış"],
    steps: ["3² = 9", "4² = 16", "9 + 16 = 25", "√25 = 5"],
    ...over,
  }) as QuizQuestion;

describe("Paket C · çözüm adımlarının sonucu doğru şıkla doğrulanır", () => {
  it("son adımın sayısı doğru şıkta: sorun yok", () => {
    expect(stepsAnswerMismatch(mcq())).toBeNull();
    expect(quizStructureIssues(mcq())).toEqual([]);
  });

  it("adımlar 25'e varıp anahtar 5'i gösteriyorsa yapı sorunu", () => {
    const wrongKey = mcq({ steps: ["3² = 9", "4² = 16", "9 + 16 = 25"], correct: ["5 cm"] });
    const issue = stepsAnswerMismatch(wrongKey);
    expect(issue).toMatch(/25.*'5 cm' değil '25 cm'/);
    expect(quizStructureIssues(wrongKey).some((line) => line.includes("Çözüm adımları"))).toBe(true);
  });

  it("sonuç başka şıkta yoksa (birim ya da ölçek farkı) yanlış alarm vermez", () => {
    expect(stepsAnswerMismatch(mcq({ steps: ["0,5 m = 50 cm", "sonuç 0,5"], options: ["50 cm", "5 cm", "500 cm", "0,05 cm"], correct: ["50 cm"] }))).toBeNull();
    expect(stepsAnswerMismatch(mcq({ steps: [], correct: ["5 cm"] }))).toBeNull();
    expect(stepsAnswerMismatch(mcq({ options: ["beş", "yedi", "on iki", "yirmi beş"], correct: ["beş"] }))).toBeNull();
  });
});

/* ───────────── Ders içi şık sayısı ───────────── */

const screenWith = (options: string[]) => ({
  heading: "Hücre zarı",
  concept: "Hücre zarı",
  blocks: [
    { type: "text" as const, text: "Hücre zarı seçici geçirgendir; su serbest, iyonlar kanalla geçer. Bu ayrım taşıma sorularının temelidir." },
    {
      type: "check" as const,
      check: {
        type: "mcq" as const,
        prompt: "Suyun zardan geçişi hangisidir?",
        options,
        answerIndex: 0,
        explanation: "Osmoz suyun geçişidir; difüzyon çözünenin.",
        optionWhy: options.map(() => "gerekçe"),
      },
    },
  ],
});

describe("Paket C · ders içi sorunun şık sayısı öğrencinin düzeyinden", () => {
  it("lise/YKS öğrencisinde 4 şıklı ders sorusu reddedilir, 5 şıklı geçer; ortaokulda tersi", () => {
    const five = ["Osmoz", "Difüzyon", "Aktif taşıma", "Endositoz", "Ekzositoz"];
    const four = five.slice(0, 4);
    const count = (options: string[], optionCount: 4 | 5) =>
      screenStructureIssues(screenWith(options) as never, 0, { runningHeaders: [], optionCount }).filter((issue) =>
        issue.problem.includes("şık olmalı"),
      );
    expect(count(four, 5).map((issue) => issue.problem)).toEqual(["Çoktan seçmeli soruda 5 şık olmalı (A–B–C–D–E)."]);
    expect(count(five, 5)).toEqual([]);
    expect(count(four, 4)).toEqual([]);
    expect(count(five, 4).map((issue) => issue.problem)).toEqual(["Çoktan seçmeli soruda 4 şık olmalı (A–B–C–D)."]);
    // Sayı verilmezse eski davranış: 4.
    expect(screenStructureIssues(screenWith(four) as never, 0, { runningHeaders: [] }).filter((issue) => issue.problem.includes("şık olmalı"))).toEqual([]);
  });

  it("yazar ŞIK SAYISI satırını okur; düzeltme istemi aynı satırı taşır; rota öğrencinin sayısını verir", () => {
    const base = { topicLabel: "Hücre", prepTitle: "YKS Biyoloji", pages: [{ page: 1, text: "…" }], upcomingTopics: [] };
    expect(lessonOptionCountLine({ optionCount: 5 })).toContain("ŞIK SAYISI: 5 (A–B–C–D–E)");
    expect(teacherUserPrompt({ ...base, optionCount: 5 })).toContain("ŞIK SAYISI: 5");
    expect(teacherUserPrompt(base)).toContain("ŞIK SAYISI: 4 (A–B–C–D)");
    const lesson = read("src/lib/learning/teacher-lesson.ts");
    expect(lesson).toContain("ŞIK SAYISI satırındaki kadar şık");
    expect(lesson).toMatch(/fixPartUserPrompt[\s\S]*teacherUserPrompt\(input\)/);
    expect(read("src/app/api/learning/exam-prep/node/route.ts")).toContain("optionCount: await studentOptionCount(input.service, input.userId, input.prepTitle)");
  });
});

/* ───────────── Şema etiketleri HTML'de, çakışmadan ───────────── */

describe("Paket C · şema etiketleri çakışmaz", () => {
  it("yakın komşular ayrı katlara iner; uzak etiketler aynı katta kalır", () => {
    const xs = [100, 118, 140, 400];
    const widths = ["60-100", "100-120", "120-160", "Uzak"].map(estimateLabelWidth);
    expect(labelTiers(xs, widths)).toEqual([0, 1, 2, 0]);
    expect(labelTiers([100, 300, 500], [40, 40, 40])).toEqual([0, 0, 0]);
    // Genişlik telefon ölçüsünden: 10 harf ≥ 100 birim.
    expect(estimateLabelWidth("0123456789")).toBeGreaterThanOrEqual(10 * CHAR_W - 1);
  });

  it("sayı doğrusu ve zaman çizgisinde etiketler SVG metni değil HTML rozet; data-diagram durur", () => {
    const card = {
      type: "diagram_card" as const,
      diagramKind: "timeline" as const,
      title: "Osmanlı kuruluş dönemi",
      items: [
        { label: "Söğüt'e yerleşme", value: 1299 },
        { label: "Koyunhisar Savaşı", value: 1302 },
        { label: "Bursa'nın fethi", value: 1326 },
        { label: "İznik'in fethi", value: 1331 },
        { label: "Rumeli'ye geçiş", value: 1354 },
      ],
    };
    const html = renderToStaticMarkup(<DiagramCard card={card as never} id="t" />);
    expect(html).toContain('data-diagram="timeline"');
    expect(html).not.toContain("<text");
    expect((html.match(/class="als-diagram-label /g) ?? []).length).toBe(10);
    expect(html).toContain("Rumeli&#x27;ye geçiş");
    // Katlar farklı `top` değerleri verir: beş alt etiket ≥ 2 farklı satıra dağılır.
    const tops = [...html.matchAll(/class="als-diagram-label is-muted is-s" style="left:[^;]+;top:([^;]+);/g)].map((m) => m[1]);
    expect(new Set(tops).size).toBeGreaterThanOrEqual(2);
  });

  it("süreç ağı kutusunun yazısı kutunun genişliğine sığar (sarma payı)", () => {
    const style = labelStyle({ x: 80, y: 64, maxW: 102 });
    expect(style.maxWidth).toBe("17.00%");
    expect(style.left).toBe("13.33%");
    expect(read("src/styles/diagram-card.css")).toMatch(/\.als-diagram-label \{[\s\S]*overflow-wrap: anywhere/);
  });
});

/* ───────────── Asılı iş kurtarma ───────────── */

describe("Paket C · ilerlemeyen yazım 3 dakikada ölü sayılır", () => {
  it("eşik 180 sn; eski 'creating' satırı için istek beklemez", async () => {
    expect(STALE_CREATING_MS).toBe(180_000);
    const row = { status: "creating", updated_at: new Date(Date.now() - 200_000).toISOString(), payload: null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: row }),
    };
    const service = { from: () => chain } as never;
    const started = Date.now();
    const ready = await waitForPrefetchReady(service, { userId: "u", nodeId: "n", maxMs: 30_000 });
    expect(ready).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

/* ───────────── Tek yüzde kaynağı ───────────── */

const snapshot = (over: Partial<TopicMasterySnapshot>): TopicMasterySnapshot => ({
  topicKey: "hucre",
  measured: true,
  level: "emerging",
  confidence: 90,
  evidenceCount: 4,
  firstAttemptCorrect: 3,
  firstAttemptTotal: 4,
  independentCorrect: 3,
  independentTotal: 4,
  lastPracticedAt: null,
  ...over,
});

describe("Paket C · dört ekranda tek sayı", () => {
  it("yüzde, durum ve çözülen sayı tek fonksiyondan; Hazırsın ekranı aynı durumu verir", () => {
    const strong = snapshot({});
    const view = topicMasteryView(strong, 70);
    expect(view).toEqual({ percent: 75, state: "ready", label: "Sağlam", text: "%75", solved: 4 });
    expect(topicState(strong, 70)).toBe(view.state);
    // Kayıtlı confidence 90 olsa da ekran ham sayılardan okur. Tek doğru cevap (Paket I #7, 30 Ekim 2026)
    // artık "%33" değil "Ölçülmedi": sönümlü öncül sayı öğrenciye anlamsızdı, ölçüm 3 cevapla başlar.
    const one = snapshot({ evidenceCount: 1, firstAttemptCorrect: 1, firstAttemptTotal: 1, independentCorrect: 1, independentTotal: 1 });
    expect(topicMasteryView(one, 70)).toMatchObject({ percent: 0, state: "unmeasured", label: "Ölçülmedi", text: "Ölçülmedi" });
    expect(topicMasteryView(snapshot({ measured: false, evidenceCount: 0 }), 70).state).toBe("unmeasured");
    expect(MASTERY_STATE_LABEL.ready).toBe("Sağlam");
  });

  it("İlerleme satırı durumu taşır; değerlendirme sayfası ayrı eşik kullanmaz", () => {
    const view = buildPrepProgressView({
      nodes: [{ id: "n1", kind: "lesson", status: "done", title: "Hücre · Ders", sessionMeta: { topicTitle: "Hücre" } }] as never,
      attempts: [],
      topicLabels: ["Hücre"],
      topicMastery: [{ label: "Hücre", confidence: 75, state: "ready" }],
      gaps: [],
      examDate: null,
      targetScore: 70,
      dailyMinutes: null,
      measuredReadinessPct: null,
    } as never);
    expect(view.topics[0]).toMatchObject({ label: "Hücre", pct: 75, state: "ready" });
    const assessment = read("src/components/parity/exam-prep-assessment.tsx");
    expect(assessment).toContain("const go = tracking.claimFullyReady;");
    expect(assessment).not.toMatch(/examReadinessPct >= 70/);
    expect(read("src/components/parity/exam-prep-progress.tsx")).toContain("MASTERY_STATE_LABEL[topic.state]");
  });
});

/* ───────────── Dört aşamalı sonuç ───────────── */

describe("Paket C · sonuç kartının dört aşaması", () => {
  it("yıldız ödül kuralından, artış kayıttan, eksikler sayımdan", () => {
    const stages = resultStages({
      kind: "quiz",
      score: 4,
      total: 5,
      streak: 3,
      topicGain: { label: "Hücre zarı", before: 40, after: 62 },
      openMisconceptions: 1,
      masteryStates: ["ready", "needs_work", "needs_work", "unmeasured"],
    });
    expect(stages.map((stage) => stage.id)).toEqual(["reward", "mastery", "gaps"]);
    expect(stages[0]).toMatchObject({ value: "+18 yıldız", note: "3 günlük seri sürüyor." });
    expect(stages[1]).toMatchObject({ value: "+%22", note: "Hücre zarı · şimdi %62", gain: true });
    expect(stages[2]!.value).toBe("1 açık yanılgı · 2 çalışılacak konu · 1 sağlam konu");
  });

  it("okunamayan veri sayfayı düşürmez; ders hâkimiyet ölçmez; artış yoksa 'Değişmedi'", () => {
    const lesson = resultStages({ kind: "lesson", score: 1, total: 1, streak: null, topicGain: null, openMisconceptions: null, masteryStates: null });
    expect(lesson[0]!.note).toBe("Seri şu an okunamadı.");
    expect(lesson[1]!.value).toBe("Bu adım ölçmez");
    expect(lesson[2]!.value).toBe("Eksik sayısı şu an okunamadı");
    expect(resultStages({ kind: "quiz", score: 2, total: 5, streak: 0, topicGain: { label: "x", before: 50, after: 50 }, openMisconceptions: 0, masteryStates: [] })[1]!.value).toBe("Değişmedi");
    expect(readTopicGain({ label: "x", before: 50, after: 40 })).toBeNull();
    const page = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/sonuc/page.tsx");
    expect(page).toContain("⏭️ Sıradaki etkinliğe geç");
    expect(page).toContain("📖 Tekrar incele");
    expect(page).not.toMatch(/from "@\/components\/parity\/topic-gain-card"/);
    expect(read("src/app/api/learning/exam-prep/node/route.ts")).toContain("topicGain: tracked.topicGain }");
  });
});

/* ───────────── Belgedeki şema derse gömülü ───────────── */

describe("Paket C · belgedeki şekil derse gömülür", () => {
  it("şekil okunmuş sayfadaki adım gömülü kartı, öbürleri düğmeyi alır", () => {
    const docs = [{ id: "d1", name: "fizyoloji.pdf", pages: "s.3–9", figurePages: [4, 7] }];
    expect(isFigurePage({ documentId: "d1", page: 4, fileName: "fizyoloji.pdf" }, docs)).toBe(true);
    expect(isFigurePage({ documentId: "d1", page: 5, fileName: "fizyoloji.pdf" }, docs)).toBe(false);
    expect(isFigurePage(null, docs)).toBe(false);
    const steps = read("src/components/parity/exam-lesson-steps.tsx");
    // 29 Ekim 2026 (Paket H): kart adımın sayfasına değil konunun şekil sayfalarına bağlı (`planFigureSources`).
    expect(steps).toContain("{figureSource ? (");
    expect(steps).toContain("planFigureSources(");
    expect(steps).toContain("<SourceFigureCard");
    const drawer = read("src/components/parity/source-page-drawer.tsx");
    expect(drawer).toContain("📌 Belgedeki Şema — Sayfa {page}");
    const page = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx");
    expect(page).toContain('.ilike("text_content", `%${FIGURE_APPENDIX_LABEL}%`)');
  });
});
