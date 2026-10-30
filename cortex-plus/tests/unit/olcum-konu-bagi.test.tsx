// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";
import {
  contentSpansTopics,
  contentTestedTopic,
  createTopicIndex,
  nodeOnTopic,
  sameTopic,
  safeTopicIds,
} from "@/lib/learning/topic-identity";
import {
  freeActivityPick,
  pickPracticeNodeId,
  planActivityInsert,
  resolveStudyToolNode,
  type StudyNodeRef,
} from "@/lib/learning/study-tools";
import { oralItemReviewable, oralMisconceptionDrafts, type OralExamReport, type OralItemGrade } from "@/lib/learning/oral-exam";
import { reviewDraftsFromAttempt } from "@/lib/learning/review-items";
import { extractMisconceptions, cardsAsShown, freezeShownCards, scoreFlashcardsV2 } from "@/lib/learning/teaching-standards";
import { extractAnswerEvidence, masteryByPlannedTopic, type TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import { activityTally, tallyScore } from "@/lib/learning/answer-tally";
import { buildPrepProgressView, readableGap, type ProgressNode } from "@/lib/learning/prep-progress-view";
import { lessonsCompleted } from "@/lib/learning/prep-metrics";
import { nodeResultView } from "@/lib/learning/node-result";
import { examPrepLessonRewriteHref, opensSavedLesson } from "@/lib/learning/exam-prep-hrefs";

/*
  Ölçme ve konu bağı (30 Ekim 2026, canlı tur: Makroekonomi hazırlığı). Belirtiler ve kök nedenleri:
  1. "Enflasyon Türleri" için açılan sözlü, "Para Politikası"nın sözlü adımında `?konu=` ile açıldı (hub konunun kendi
     düğümü yoksa türün ilk düğümüne düşüyordu); sözlü yeniden hedeflenmediği için kaynak hazırlık adıyla aranıp sorular
     üç konudan geldi; kayıt Para Politikası'na, kanıt "Enflasyon Türleri"ne yazıldı.
  2. %88 alan cevap ve cevapsız soru "Bilgi eksikleri"ne düştü; başlık öğrencinin ham yazısıydı.
  3. Kart oturumu 10 kart gösterdi (dersin kaçırılan 2 sorusu eklenmişti), not kayıttaki 8 kartla verildi: 8/10 ↔ 6/8.
  4. İlerleme "çözüldü"yü düğüm başlığına göre etkinlik kayıtlarından sayıyordu; kapsam satırı yoktu; kartlarla tekrar
     "ders" sayılıyordu.
  5. Bitmiş dersin düz adresi "Ders oluştur" açıp uyarısız yeni ders yazdırdı.
  Örnekler farklı derslerden (makroekonomi, biyoloji, kimya, tarih, hukuk).
*/

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

const read = (path: string) => readSource(path).replace(/\r\n/g, "\n");

describe("tek konu kimliği: kimlik önce, ad yalnız kimlik yoksa", () => {
  const rows = [
    { id: "row-enf", label: "Enflasyon Türleri", documentTopicNodeId: "doc-enf" },
    { id: "row-para", label: "Para Politikası", documentTopicNodeId: "doc-para" },
    { id: "row-sto", label: "Stokiyometri", documentTopicNodeId: null },
  ];

  it("düğüm belge konu düğümünü, konu satırı kendi kimliğini taşısa da aynı konudur", () => {
    expect(nodeOnTopic({ topicId: "doc-enf", topicTitle: "Enflasyon Türleri" }, { id: "row-enf", documentTopicNodeId: "doc-enf" })).toBe(true);
    // İki tarafta kimlik var ve tutmuyor: ad aynı olsa da başka konu (ad tahmini kimliği ezmez).
    expect(nodeOnTopic({ topicId: "doc-para", topicTitle: "Enflasyon Türleri" }, { id: "row-enf", documentTopicNodeId: "doc-enf" })).toBe(false);
    // Kimlik bir tarafta yoksa ad: birebir ya da uzantı.
    expect(sameTopic({ label: "Stokiyometri" }, { id: "x", label: "Stokiyometri: sınırlayıcı bileşen" })).toBe(true);
    expect(sameTopic({ label: "Gazlar" }, { id: "x", label: "Stokiyometri" })).toBe(false);
  });

  it("dizin iki kimliği de, adı da tanır; birden çok uzantı eşleşirse tahmin etmez", () => {
    const index = createTopicIndex(rows);
    expect(index.rowFor({ id: "doc-para" })?.id).toBe("row-para");
    expect(index.rowFor({ id: "row-para" })?.id).toBe("row-para");
    expect(index.rowFor("enflasyon türleri")?.id).toBe("row-enf");
    // Bayat kimlik ada düşer.
    expect(index.rowFor({ id: "silinmis", label: "Stokiyometri" })?.id).toBe("row-sto");
    const tarih = createTopicIndex([
      { id: "a", label: "Osmanlı: Kuruluş" },
      { id: "b", label: "Osmanlı: Yükselme" },
    ]);
    expect(tarih.rowForKey("Osmanlı")).toBeNull();
    // Tek bir konunun uzantısı o konudur.
    expect(tarih.rowForKey("Osmanlı: Kuruluş Dönemi")?.id).toBe("a");
    expect(safeTopicIds(["row-1", "x,id.neq.0", "row-1", 7])).toEqual(["row-1"]);
  });

  it("içeriğin kapsamı: birden çok konuyu kapsayan sözlü tek konu taşımaz", () => {
    expect(contentTestedTopic({ type: "oral", testedTopic: "Mitoz" })).toBe("Mitoz");
    expect(contentSpansTopics({ type: "oral", scope: "topics" })).toBe(true);
    expect(contentTestedTopic({ type: "oral", scope: "all", testedTopic: "Mitoz" })).toBeNull();
  });
});

function ref(id: string, kind: string, status: string, topicId: string, topicTitle: string, sortOrder: number): StudyNodeRef {
  return { id, kind, status, sortOrder, sessionMeta: { topicId, topicTitle } };
}

describe("hub ve seçici: konunun kendi düğümü, yoksa kurulur — başka konunun adımı açılmaz", () => {
  // Belgeli hazırlık: düğümler belge konu düğümünü taşır.
  const macro = [
    ref("les-enf", "lesson", "done", "doc-enf", "Enflasyon Türleri", 0),
    ref("oral-para", "oral", "locked", "doc-para", "Para Politikası", 1),
    ref("quiz-para", "quiz", "locked", "doc-para", "Para Politikası", 2),
  ];
  const enflasyon = { id: "row-enf", documentTopicNodeId: "doc-enf", label: "Enflasyon Türleri" };

  it("sözlüsü olmayan konuda 'create' döner; Para Politikası'nın sözlüsü açılmaz", () => {
    const pick = freeActivityPick(macro, "prep", enflasyon, "oral");
    expect(pick).toMatchObject({ ok: true, kind: "create", topicId: "row-enf", topicLabel: "Enflasyon Türleri" });
    // Kendi düğümü varsa (başlığı farklı yazılmış olsa da) kimlikle bulunur.
    const own = [...macro, ref("oral-enf", "oral", "locked", "doc-enf", "Enflasyon türleri: talep ve maliyet", 3)];
    expect(freeActivityPick(own, "prep", enflasyon, "oral")).toMatchObject({ kind: "node", nodeId: "oral-enf" });
    expect(resolveStudyToolNode(own, "oral", enflasyon)?.id).toBe("oral-enf");
  });

  it("yeni adım konunun son adımının arkasına, belge konu düğümü kimliğiyle", () => {
    const nodes = [
      { id: "les-mit", kind: "lesson", sortOrder: 4, dayIndex: 2, sessionMeta: { topicId: "doc-mit", topicTitle: "Mitoz", sourcePages: [3, 4] } },
      { id: "les-may", kind: "lesson", sortOrder: 9, dayIndex: 4, sessionMeta: { topicId: "doc-may", topicTitle: "Mayoz" } },
    ];
    const plan = planActivityInsert(nodes, { id: "row-mit", documentTopicNodeId: "doc-mit", label: "Mitoz" }, "oral");
    expect(plan.afterSort).toBe(4);
    expect(plan.sessionMeta).toMatchObject({ topicId: "doc-mit", topicTitle: "Mitoz", sourcePages: [3, 4] });
    // Konunun hiç adımı yoksa yine aynı biçim (belge konu düğümü).
    expect(planActivityInsert(nodes, { id: "row-hc", documentTopicNodeId: "doc-hc", label: "Hücre Zarı" }, "quiz").sessionMeta.topicId).toBe("doc-hc");
  });

  it("sözlüden sonraki önerilen pratik sorulan konudan (kimlikle)", () => {
    const own = [...macro, ref("quiz-enf", "quiz", "locked", "doc-enf", "Enflasyon Türleri", 4)];
    expect(pickPracticeNodeId(own, enflasyon)).toBe("quiz-enf");
    expect(pickPracticeNodeId(own, { id: "row-para", documentTopicNodeId: "doc-para", label: "Para Politikası" })).toBe("quiz-para");
  });

  it("hub: sözlüsü olmayan konu seçilince kurulum ucunu konu kimliğiyle çağırır, başka konunun adımını açmaz", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, nodeId: "oral-new", href: "/deneme-sinavlari/prep-1/dugum/oral-new" })));
    vi.stubGlobal("fetch", fetchMock);
    const nodes: HomeNode[] = [
      { id: "les-borc", kind: "lesson", title: "Borçlar", dayIndex: 1, sortOrder: 0, status: "ready", sessionMeta: { topicId: "doc-borc", topicTitle: "Borçlar Hukuku" } },
      { id: "oral-borc", kind: "oral", title: "AI ile Sözlü Deneme", dayIndex: 1, sortOrder: 1, status: "locked", sessionMeta: { topicId: "doc-borc", topicTitle: "Borçlar Hukuku" } },
    ];
    render(
      <ExamPrepHome
        prepId="prep-1"
        title="Hukuk"
        examType="Okul"
        examDate={null}
        daysLabel=""
        progressPct={0}
        nodes={nodes}
        hasTopic
        needsIntro={false}
        startHref="/deneme-sinavlari/prep-1/sonraki"
        topicCount={2}
        topicsDone={0}
        topicLabels={["Borçlar Hukuku", "Anayasa"]}
        topicOptions={[
          { id: "row-borc", label: "Borçlar Hukuku", documentTopicNodeId: "doc-borc" },
          { id: "row-ana", label: "Anayasa", documentTopicNodeId: "doc-ana" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hazırlık seçenekleri" }));
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    fireEvent.change(screen.getByLabelText("Konu seç"), { target: { value: "Anayasa" } });
    fireEvent.click(screen.getByRole("tab", { name: "Sınav" }));
    expect(screen.queryByRole("link", { name: "Sözlü deneme" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sözlü deneme" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/learning/exam-prep/activity");
    expect(JSON.parse(String(init.body))).toMatchObject({ tool: "oral", topicId: "row-ana", topicLabel: "Anayasa" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/deneme-sinavlari/prep-1/dugum/oral-new"));

    // Kendi konusu seçiliyse kendi sözlüsü (kimlikle) açılır.
    fireEvent.change(screen.getByLabelText("Konu seç"), { target: { value: "Borçlar Hukuku" } });
    expect(screen.getByRole("link", { name: "Sözlü deneme" }).getAttribute("href")).toBe("/deneme-sinavlari/prep-1/dugum/oral-borc");
  });
});

function oralItem(over: Partial<OralItemGrade>): OralItemGrade {
  return {
    index: 0,
    question: "Talep enflasyonu nasıl oluşur?",
    answer: "Toplam talep arzı aşınca fiyatlar artar",
    ratio: 1,
    verdict: "dogru",
    right: "",
    gap: "",
    missing: [],
    modelAnswer: "Toplam talep, üretim kapasitesini aşınca genel fiyat düzeyi yükselir.",
    citation: null,
    dontKnow: false,
    numericIssue: null,
    objective: "Talep enflasyonunun nedeni",
    ...over,
  };
}

function oralReport(items: OralItemGrade[]): OralExamReport {
  return {
    fullCount: items.filter((item) => item.ratio >= 0.99).length,
    total: items.length,
    pct: 0,
    items,
    strengths: [],
    weaknesses: [],
    missingObjectives: [],
    correctIndices: items.filter((item) => item.ratio >= 0.99).map((item) => item.index),
    nextStep: null,
  };
}

describe("bilgi eksikleri: yeterli cevap eksik değil, boş soru ham yazıyla yazılmaz, konu sorudan", () => {
  const items = [
    // %88: yeterli (canlı turdaki doğru cevap).
    oralItem({ index: 0, ratio: 0.88, verdict: "kismen" }),
    oralItem({ index: 1, question: "Merkez bankası tahvil satınca ne olur?", answer: "para arzını kontrol eder", ratio: 0.13, verdict: "yanlis", objective: "Açık piyasa işlemleri" }),
    // Cevaplanmadı (Sınavı bitir).
    oralItem({ index: 2, question: "Miktar teorisinde MV=PY nedir?", answer: "", ratio: 0, verdict: "bos", dontKnow: true, objective: "Miktar teorisi" }),
    // Açıkça "bilmiyorum" dedi: eksik, ama başlık sorunun hedefi.
    oralItem({ index: 3, question: "Osmanlı'da tımar sistemi nedir?", answer: "Bilmiyorum", ratio: 0, verdict: "bos", dontKnow: true, objective: "Tımar sistemi" }),
  ];

  it("yanılgı ve günü gelen tekrar aynı eşiği okur", () => {
    expect(items.map(oralItemReviewable)).toEqual([false, true, false, true]);
    const drafts = oralMisconceptionDrafts(oralReport(items));
    expect(drafts.map((d) => d.claim)).toEqual(["Açık piyasa işlemleri", "Tımar sistemi"]);
    expect(drafts.some((d) => d.claim.includes("para arzını"))).toBe(false);
    const reviews = reviewDraftsFromAttempt({
      attemptId: "a1",
      kind: "oral",
      payload: { type: "oral", testedTopic: "Para Politikası" },
      answers: {},
      topicLabel: "Enflasyon Türleri",
      oralReport: oralReport(items),
    });
    expect(reviews.map((r) => (r.item as { front?: string }).front)).toEqual([
      "Merkez bankası tahvil satınca ne olur?",
      "Osmanlı'da tımar sistemi nedir?",
    ]);
    // Konu içeriğin sorduğu konudan, düğümün konusundan değil.
    expect(reviews.every((r) => r.topicLabel === "Para Politikası")).toBe(true);
  });

  it("kanıtta yeterli cevap doğru sayılır; birden çok konuyu kapsayan sözlü tek konuya yazılmaz", () => {
    const payload = { type: "oral", testedTopic: "Enflasyon Türleri", questions: items.map((item) => ({ prompt: item.question })), gradeMeta: oralReport(items) };
    const answers = Object.fromEntries(items.map((item) => [String(item.index), item.answer]));
    const evidence = extractAnswerEvidence({ kind: "oral", payload, answers, topicLabel: "Para Politikası", isFirstAttempt: true });
    expect(evidence.map((row) => row.correct)).toEqual([true, false, false, false]);
    expect(evidence.every((row) => row.topicKey === "enflasyon türleri")).toBe(true);
    const spans = { ...payload, scope: "topics", testedTopic: undefined };
    expect(extractAnswerEvidence({ kind: "oral", payload: spans, answers, topicLabel: "Para Politikası", isFirstAttempt: true })).toEqual([]);
    const misconceptions = extractMisconceptions({ kind: "oral", payload: spans, answers, topicLabel: "Para Politikası" });
    expect(misconceptions.length).toBeGreaterThan(0);
    expect(misconceptions.every((row) => row.topicLabel === null)).toBe(true);
  });

  it("eski sözlü satırı okunur: başlık soru, öğrencinin ham yazısı ve 'Bilmiyorum' görünmez", () => {
    expect(
      readableGap({ claim: "talep enflasyon toplm talebin artmasi", topicLabel: "enflasyon türleri", detail: "Talep enflasyonu nasıl oluşur?", sourceKind: "oral" }, (label) =>
        label === "enflasyon türleri" ? "Enflasyon Türleri" : label,
      ),
    ).toEqual({ claim: "Talep enflasyonu nasıl oluşur?", topicLabel: "Enflasyon Türleri", detail: null, sourceKind: "oral" });
    expect(readableGap({ claim: "Bilmiyorum", topicLabel: null, detail: "Mol nedir?", sourceKind: "oral" }).claim).toBe("Mol nedir?");
    // Test satırı değişmez.
    expect(readableGap({ claim: "Ters fonksiyon", topicLabel: "Fonksiyonlar", detail: "B", sourceKind: "quiz" }).claim).toBe("Ters fonksiyon");
  });
});

describe("kartlar: oturum, not ve sonuç aynı listeden", () => {
  const generated = Array.from({ length: 8 }, (_, i) => ({ front: `Kart ${i + 1}: Cagan tanımı ${i}`, back: "…" }));
  const review = [
    { front: "Dersin kaçırılan sorusu: TÜFE hizmetleri kapsar mı?", back: "Evet." },
    { front: "Dersin kaçırılan sorusu: Yİ-ÜFE neyi ölçer?", back: "Üretici fiyatları." },
  ];
  // Canlı tur: 1 Bilemedim, 1 Zorlandım, 8 Bildim (ilk sekizin içinde Bilemedim ve Zorlandım var).
  const answers: Record<string, unknown> = { "0": 5, "1": 1, "2": 5, "3": 3, "4": 5, "5": 5, "6": 5, "7": 5, "8": 5, "9": 5 };

  it("dersin kaçırılan soruları eklenmiş liste puanlanır: 8/10, 6/8 değil", () => {
    const stored = { type: "cards", cards: generated };
    const shown = cardsAsShown(stored, review);
    expect((shown.cards as unknown[]).length).toBe(10);
    const client = tallyScore(activityTally(shown, answers));
    const server = scoreFlashcardsV2((shown.cards as unknown[]).length, answers);
    expect(client).toEqual({ score: 8, total: 10 });
    expect({ score: server.score, total: server.total }).toEqual(client);
    // Eski hata: kayıttaki 8 kartla notlanıyordu.
    expect(scoreFlashcardsV2(generated.length, answers).score).toBe(6);
  });

  it("liste kayda geçince donar: sonradan değişen tekrar listesi kartları değiştirmez", () => {
    const frozen = freezeShownCards<Record<string, unknown>>({ type: "cards", cards: generated }, review);
    expect(frozen.reviewCardsFrozen).toBe(true);
    expect((frozen.cards as unknown[]).length).toBe(10);
    expect(cardsAsShown(frozen, [{ front: "Yeni kaçırılan soru", back: "x" }])).toBe(frozen);
    expect(freezeShownCards({ type: "quiz", questions: [] }, review)).toEqual({ type: "quiz", questions: [] });
  });

  it("sonuç sayfası kartta 'Bildiğin kartlar' der", () => {
    const view = nodeResultView({ score: 8, total: 10, startedAt: null, createdAt: "2026-10-30T09:00:00Z", updatedAt: null, kind: "spaced" });
    expect(view.scoreLabel).toBe("Bildiğin kartlar");
    expect(nodeResultView({ score: 3, total: 5, startedAt: null, createdAt: "2026-10-30T09:00:00Z", updatedAt: null, kind: "quiz" }).scoreLabel).toBe("Doğru cevaplar");
  });

  it("rota: notlandırma, tekrar ve kayıt aynı kart listesini okur", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("const shownPayload = cardsAsShown(");
    expect(route).toContain("let scored = scoreAttempt(kind, shownPayload, mergedAnswers, teachingV2);");
    // Sunucunun kart puanı oturumdaki sayımla aynı işlevden (`answer-tally.ts`).
    const cardsBranch = route.slice(route.indexOf('if (data.type === "cards") {'), route.indexOf('if (data.type === "oral") {', route.indexOf('if (data.type === "cards") {')));
    expect(cardsBranch).toContain("tallyScore(activityTally(data, answers))");
    expect(cardsBranch).not.toContain("scoreFlashcardsV2");
    expect(route).toContain("payload = freezeShownCards(payload, lessonReviewCards);");
    expect(route.indexOf("payload = freezeShownCards(payload, lessonReviewCards);")).toBeLessThan(
      route.indexOf("const total = countTotal(kind, payload);"),
    );
  });
});

function snap(topicKey: string, total: number, correct: number): TopicMasterySnapshot {
  return {
    topicKey,
    measured: total > 0,
    level: "weak",
    confidence: 0,
    evidenceCount: total,
    firstAttemptCorrect: correct,
    firstAttemptTotal: total,
    independentCorrect: correct,
    independentTotal: total,
    lastPracticedAt: "2026-10-30T09:00:00.000Z",
  };
}

describe("İlerleme: kanıt doğru konuya, kapsam görünür, ders yalnız ders", () => {
  const labels = ["Enflasyon Türleri", "Para Politikası", "Miktar Teorisi"];
  const refs = [
    { id: "row-enf", label: "Enflasyon Türleri", documentTopicNodeId: "doc-enf" },
    { id: "row-para", label: "Para Politikası", documentTopicNodeId: "doc-para" },
    { id: "row-mik", label: "Miktar Teorisi", documentTopicNodeId: "doc-mik" },
  ];
  const nodes: ProgressNode[] = [
    { id: "les-enf", kind: "lesson", title: "Ders", status: "done", sessionMeta: { topicId: "doc-enf", topicTitle: "Enflasyon türleri ve kavramlar" } },
    { id: "rev-enf", kind: "spaced", title: "Kartlarla tekrar", status: "done", sessionMeta: { topicId: "doc-enf", topicTitle: "Enflasyon Türleri" } },
    { id: "oral-para", kind: "oral", title: "Sözlü", status: "done", sessionMeta: { topicId: "doc-para", topicTitle: "Para Politikası" } },
    { id: "les-para", kind: "lesson", title: "Ders", status: "locked", sessionMeta: { topicId: "doc-para", topicTitle: "Para Politikası" } },
  ];

  it("başka konunun düğümünde yapılan sözlü sorulan konuya sayılır; çözülen kanıttan; kapsam ve ders doğru", () => {
    const mastery = masteryByPlannedTopic(labels, [snap("enflasyon türleri", 3, 1), snap("miktar teorisi", 1, 1), snap("eski yetim anahtar", 5, 5)]);
    const view = buildPrepProgressView({
      nodes,
      attempts: [
        // Canlı tur: sözlü Para Politikası'nın adımında, içerik "Enflasyon Türleri"ni sordu.
        { nodeId: "oral-para", score: 33, total: 100, createdAt: "2026-10-30T09:00:00Z", topicId: "row-para", testedTopic: "Enflasyon Türleri" },
      ],
      topicLabels: labels,
      topicRefs: refs,
      topicMastery: labels.map((label) => {
        const snapshot = mastery.get(label);
        const measured = Boolean(snapshot && snapshot.evidenceCount >= 3);
        return { label, confidence: measured ? 33 : 0, state: measured ? ("needs_work" as const) : ("unmeasured" as const), solved: snapshot?.evidenceCount ?? 0 };
      }),
      gaps: [],
      examDate: null,
      targetScore: 70,
      dailyMinutes: null,
      measuredReadinessPct: 10,
      now: new Date("2026-10-30T12:00:00Z"),
    });
    const byLabel = Object.fromEntries(view.topics.map((topic) => [topic.label, topic]));
    // Kanıttan: Enflasyon Türleri 3 çözüldü (ölçüldü), Para Politikası 0, Miktar Teorisi 1 (denemenin tek sorusu, ölçülmedi).
    expect(byLabel["Enflasyon Türleri"]).toMatchObject({ solved: 3, state: "needs_work", lessons: 1 });
    expect(byLabel["Para Politikası"]).toMatchObject({ solved: 0, state: "unmeasured", pct: 0, lessons: 0 });
    expect(byLabel["Miktar Teorisi"]).toMatchObject({ solved: 1, state: "unmeasured", pct: 0 });
    // Haftalık tablo da sorulan konuya.
    expect(view.weeks.rows.find((row) => row.label === "Enflasyon Türleri")?.counts.at(-1)).toBe(1);
    expect(view.weeks.rows.find((row) => row.label === "Para Politikası")?.counts.at(-1)).toBe(0);
    expect(view.measuredTopics).toBe(1);
    expect(view.coverageText).toBe("1/3 konu ölçüldü");
    // Kartlarla tekrar ders değil: tek ders bitti.
    expect(view.lessonsDone).toBe(1);
    expect(lessonsCompleted(nodes)).toBe(1);
  });

  it("hâkimiyet ad varyantını aynı konuya toplar; hiçbir konuya bağlanmayan satır sayılmaz", () => {
    const mastery = masteryByPlannedTopic(["Stokiyometri", "Gazlar"], [
      snap("stokiyometri", 2, 2),
      snap("stokiyometri: sınırlayıcı bileşen", 2, 1),
      snap("organik kimya", 4, 4),
    ]);
    expect(mastery.get("Stokiyometri")).toMatchObject({ evidenceCount: 4, independentCorrect: 3, independentTotal: 4 });
    expect(mastery.has("Gazlar")).toBe(false);
    expect([...mastery.keys()]).toEqual(["Stokiyometri"]);
  });

  it("İlerleme ekranı kapsam satırını yazar", () => {
    const component = read("src/components/parity/exam-prep-progress.tsx");
    expect(component).toContain("konu ölçüldü");
    expect(component).toContain("view.coverageText");
    const page = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(page).toContain("masteryByPlannedTopic(topicLabels, masterySnapshots)");
    expect(page).toContain("...attemptTopicFields(row)");
    expect(page).toContain('.select("node_id, score, total, created_at, payload, topic_id")');
  });
});

describe("sözlü: seçilen konu üretime, başlığa ve kayda aynı kimlikle", () => {
  it("istemci seçilen konuların kimliğini gönderir; başta düğümün kendi konusu seçili", () => {
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).toContain("oralTopicIds: oralSelected.includes(ORAL_ALL_TOPICS)");
    expect(session).toContain("oralTopics.find((topic) => Boolean(topicId) && topic.id === topicId)");
  });

  it("rota: tek konu kimlikle yeniden hedeflenir, çoklu seçim 'topics' kapsamıdır, bitiş sorulan konuyu okur", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("oralTopicIds: z.array(z.string().max(64)).max(30).optional()");
    expect(route).toContain("requestedTopicId: oralTopicIds[0] ?? null");
    expect(route).toContain('scope: parsed.data.oralScope === "all" ? "all" : "topics"');
    expect(route).toContain("const tested = spansTopics ? null : testedTopicRow(topicIndex, shownPayload, topic);");
    expect(route).toContain("topicLabel: doneTopicLabel ?? topicLabel,");
    expect(route).toContain("topic_label: canonicalTopicLabel(d.topicLabel),");
    // Bitirme isteği kapsam taşımaz: kapsam kayıtlı içerikten.
    expect(route).not.toContain('const practiceTopic = parsed.data.oralScope === "all" ? null : topicLabel;');
  });
});

describe("bitmiş ders kayıtlı hâliyle açılır; yeni anlatım yalnız 'Farklı anlat' ile", () => {
  it("düz adres kayıtlı dersi açar; tekrar, farklı anlat ve konu seçimi açık seçimdir", () => {
    expect(opensSavedLesson({ kind: "lesson", status: "done", query: {} })).toBe(true);
    expect(opensSavedLesson({ kind: "lesson", status: "done", query: { farkli: "1" } })).toBe(false);
    expect(opensSavedLesson({ kind: "lesson", status: "done", query: { tekrar: "1" } })).toBe(false);
    expect(opensSavedLesson({ kind: "lesson", status: "done", query: { konu: "Mitoz" } })).toBe(false);
    expect(opensSavedLesson({ kind: "lesson", status: "ready", query: {} })).toBe(false);
    expect(opensSavedLesson({ kind: "quiz", status: "done", query: {} })).toBe(false);
    expect(opensSavedLesson({ kind: "quiz", status: "done", query: { incele: "1" } })).toBe(true);
    expect(examPrepLessonRewriteHref("p", "n")).toBe("/deneme-sinavlari/p/dugum/n?farkli=1");
  });

  it("düğüm sayfası, sonuç sayfası ve oturum aynı kuralı okur", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx");
    expect(page).toContain("reviewSaved={opensSavedLesson(");
    expect(page).toContain("rewriteHref={node.kind === \"lesson\" ? examPrepLessonRewriteHref(prepId, nodeId) : null}");
    const result = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/sonuc/page.tsx");
    expect(result).toContain("href={examPrepLessonRewriteHref(prepId, nodeId)}");
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).toContain("if (reviewSaved && rewriteHref) {");
  });
});
