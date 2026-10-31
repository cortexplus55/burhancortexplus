// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  PAST_MIN_QUESTIONS,
  TWIN_EXAM_LABEL,
  detectPastQuestions,
  pastSamplesFor,
  pastStyleBrief,
  pastTopicWeights,
} from "@/lib/learning/mock-exam/past-questions";
import { KEY_TERMS_TITLE, scoringKeyTerms } from "@/lib/learning/mock-exam/key-terms";
import { mockExamSpecKey } from "@/lib/learning/mock-exam/fallback-exam";
import { openTwin, readTwinQuestion, readTwoOptionHint, sealTwin } from "@/lib/learning/twin-question";
import { TWIN_BUTTON, TWO_OPTION_CHIP, TWO_OPTION_FALLBACK } from "@/lib/learning/twin-question-copy";
import { normalizeQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { TwinQuestionCard } from "@/components/learning/twin-question-card";
import { TwoOptionHint } from "@/components/learning/two-option-hint";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";

/*
  Paket J3 #11-#12 (31 Ekim 2026). Örnekler farklı derslerden (fizik, tarih, kimya, biyoloji).
*/

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const PAST_EXAM = `
2023 Güz Vize Soruları
1. Kütlesi 4 kg olan cisme 20 N kuvvet uygulanırsa ivmesi kaç m/s² olur?
A) 2
B) 4
C) 5
D) 8
E) 10
2) Osmanlı Devleti'nde Tanzimat Fermanı hangi padişah döneminde ilan edilmiştir?
A) II. Mahmut
B) Abdülmecid
C) Abdülaziz
D) II. Abdülhamid
3. Newton'un üçüncü yasasını bir örnekle açıklayınız.
Soru 4: Mol kavramını tanımlayınız ve Avogadro sayısının anlamını yazınız.
5. Sürtünmesiz eğik düzlemde kayan cismin ivmesi hangi büyüklüklere bağlıdır?
`;

const LECTURE = `
1. Mitoz bölünme vücut hücrelerinde görülür.
2. Profaz evresinde kromozomlar belirginleşir.
3. Metafazda kromozomlar ekvatoral düzleme dizilir.
4. Anafazda kardeş kromatitler ayrılır.
5. Telofazda çekirdek zarı yeniden oluşur.
`;

describe("#11 çıkmış sorulardan ikiz sınav", () => {
  it("çıkmış soru biçimini tanır; ders notundaki numaralı liste soru sayılmaz", () => {
    const found = detectPastQuestions(PAST_EXAM);
    expect(found.length).toBe(5);
    expect(found.filter((q) => q.kind === "mcq")).toHaveLength(2);
    expect(found[0].text).toContain("ivmesi kaç m/s²");
    expect(found.length).toBeGreaterThanOrEqual(PAST_MIN_QUESTIONS);
    expect(detectPastQuestions(LECTURE)).toEqual([]);
  });

  it("konu dağılımı soruların bağlandığı konulardan; yarısından azı bağlanırsa dağılım uydurulmaz", () => {
    const found = detectPastQuestions(PAST_EXAM);
    const weights = pastTopicWeights(found, ["Kuvvet ve Hareket (Newton Yasaları)", "Tanzimat Dönemi", "Mol Kavramı"]);
    expect(weights.get("Kuvvet ve Hareket (Newton Yasaları)")).toBeGreaterThan(weights.get("Mol Kavramı") ?? 0);
    expect(weights.has("Tanzimat Dönemi")).toBe(true);
    expect(pastTopicWeights(found, ["Hücre Bölünmesi", "Fotosentez"]).size).toBe(0);
  });

  it("yazar örnek kökleri görür ama kopyalamaz; ikiz sınav ayrı kâğıt, eski anahtarlar değişmez", () => {
    const found = detectPastQuestions(PAST_EXAM);
    const brief = pastStyleBrief(pastSamplesFor(found, "Newton'un Hareket Yasaları"));
    expect(brief).toContain("KOPYALAMA");
    expect(brief).toContain("Newton'un üçüncü yasasını");
    const base = { preset: "standard" as const, scope: "all" as const };
    expect(mockExamSpecKey(base)).toBe(JSON.stringify({ preset: "standard", scope: "all", topicIds: [], durationMinutes: null, topicLabel: null, questionCount: null }));
    expect(mockExamSpecKey({ ...base, twin: true })).not.toBe(mockExamSpecKey(base));
    expect(TWIN_EXAM_LABEL).toBe("🎯 Çıkmış Sorulara Göre İkiz Sınav");
  });

  it("seçenek kurulumdan üretime kadar taşınır; önizleme üretimle aynı ağırlığı okur", () => {
    expect(read("src/app/api/learning/exam-prep/mock-exam/route.ts")).toContain("twin: z.boolean().optional()");
    const create = read("src/lib/learning/mock-exam/create.ts");
    expect(create).toContain("applyPastWeights(slots, past)");
    expect(create).toContain("input.styleBrief");
    expect(read("src/lib/learning/mock-exam-durable.ts")).toContain("twin: spec.twin");
    const page = read("src/app/deneme-sinavlari/[prepId]/deneme/kurulum/page.tsx");
    expect(page).toContain("applyPastWeights(twinSlots, past)");
    const setup = read("src/components/parity/mock-exam-setup.tsx");
    expect(setup).toContain("twin && pastQuestions ? { twin: true } : {}");
    expect(setup).toContain("pastQuestions.weights[t.id]");
  });

  it("açık uçlu incelemede puan getiren terimler ve birimler", () => {
    expect(KEY_TERMS_TITLE).toBe("🎯 Sınavda Hocanın Puan Verdiği Anahtar Terimler & Birimler");
    const physics = scoringKeyTerms({
      questionText: "4 kg kütleli cisme 20 N kuvvet uygulanıyor. İvmeyi bulunuz.",
      rubric: ["Newton'un ikinci yasası yazılır", "Net kuvvet ve kütle oranı kurulur", "İvme birimiyle verilir"],
      modelAnswer: "**Newton'un ikinci yasası**: F = m·a. Net kuvvet 20 N, kütle 4 kg; a = 20 / 4 = 5 m/s².",
    });
    expect(physics).toContain("Newton'un ikinci yasası");
    expect(physics.some((term) => term.endsWith("m/s²"))).toBe(true);
    expect(physics.length).toBeLessThanOrEqual(4);
    const history = scoringKeyTerms({
      questionText: "Tanzimat Fermanı'nın önemini açıklayınız.",
      rubric: ["Kanun üstünlüğü ilkesine değinir", "Can ve mal güvencesi belirtilir", "Batılılaşma sürecinin başlangıcı olarak yorumlanır"],
      modelAnswer: "Tanzimat ile kanun üstünlüğü ilkesi kabul edildi, can ve mal güvencesi sağlandı; Batılılaşma sürecinin önemli bir adımıdır.",
    });
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history.join(" | ").toLocaleLowerCase("tr-TR")).toContain("kanun üstünlüğü");
    // Canlı 11 soru (tıp, genetik, muhasebe; 31 Ekim 2026): cümle parçası yok; formül, oran, kısaltma, teknik terim var.
    const live = JSON.parse(read("tests/fixtures/key-terms-live-31-ekim.json")) as Array<{
      q: string;
      rubric: { criterion: string }[];
      answer: string;
    }>;
    const terms = live.map((row) =>
      scoringKeyTerms({ questionText: row.q, rubric: row.rubric.map((item) => item.criterion), modelAnswer: row.answer }),
    );
    expect(terms[1]).toEqual(["VSD, ASD, PDA", "aort koarktasyonu", "Fallot tetralojisi", "basınç yükü"]);
    expect(terms[3]).toEqual(["6 ay-5 yaş", "ABC", "Febril nöbet"]);
    expect(terms[4]).toContain("homolog kromozom");
    expect(terms[5]).toEqual(["1 AA : 2 Aa : 1 aa", "3 baskın : 1 çekinik"]);
    expect(terms[7]).toEqual(["IA = IB > i", "IAIB", "ABO"]);
    expect(terms[9]).toContain("40.000 TL + 90.000 TL − 25.000 TL");
    expect(terms[9]).toContain("105.000 TL");
    expect(terms[10]).toEqual(["35 TL", "500 TL − 35 TL = 465 TL"]);
    // İlk sürümün canlıda ürettiği parçalar bir daha çıkmaz.
    const flat = terms.flat();
    for (const bad of ["3 A", "ayrılır ve her gamet", "kalıtsal bir özelliği belirleyen", "kromozomlardaki genlerin", "TL = 465"]) {
      expect(flat).not.toContain(bad);
    }
    // Hiç ortak nokta yoksa şerit yok (kod terim uydurmaz).
    expect(scoringKeyTerms({ rubric: ["Doğru cevap"], modelAnswer: "Evet." })).toEqual([]);
    const review = read("src/components/parity/exam-question-review-client.tsx");
    expect(review).toContain("KEY_TERMS_TITLE");
    expect(read("src/app/deneme-sinavlari/[prepId]/deneme/[examId]/incele/page.tsx")).toContain("scoringKeyTerms(");
  });
});

const ORIGINAL = normalizeQuizQuestion({
  text: "Kütlesi 4 kg olan cisme 20 N net kuvvet uygulanırsa ivmesi kaç m/s² olur?",
  options: ["2", "4", "5", "8", "10"],
  correct: ["5"],
  explanation: "a = F/m = 20/4 = 5 m/s².",
}) as QuizQuestion;

describe("#12 ikiz soru", () => {
  it("ikiz soru aynı şık sayısında, tek doğrulu ve ana sorudan farklı olmalı", () => {
    const twin = readTwinQuestion(
      { text: "Kütlesi 5 kg olan cisme 30 N net kuvvet uygulanırsa ivmesi kaç m/s² olur?", options: ["3", "6", "5", "8", "10"], correct: ["6"], explanation: "a = 30/5 = 6 m/s²." },
      ORIGINAL,
    );
    expect(twin?.options.slice().sort()).toEqual(["10", "3", "5", "6", "8"]);
    expect(twin?.correct).toEqual(["6"]);
    expect(readTwinQuestion({ text: ORIGINAL.text, options: ORIGINAL.options, correct: ["5"] }, ORIGINAL)).toBeNull();
    expect(readTwinQuestion({ text: "Başka soru nedir burada?", options: ["a", "b", "c"], correct: ["a"] }, ORIGINAL)).toBeNull();
    expect(readTwinQuestion({ text: "Başka soru nedir burada?", options: ["a", "b", "c", "d", "e"], correct: ["a", "b"] }, ORIGINAL)).toBeNull();
    expect(readTwinQuestion({ text: "Başka soru nedir burada?", options: ["a", "a", "c", "d", "e"], correct: ["a"] }, ORIGINAL)).toBeNull();
  });

  it("model şıklara harf yazarsa harf düşer, anahtar aynı biçime çekilir (31 Ekim canlı deneme)", () => {
    const original = normalizeQuizQuestion({
      text: "Genel fiyat düzeyi sürekli düşüyor. Bu durumu hangi kavram karşılar?",
      options: ["Stagflasyon", "Enflasyon", "Dezenflasyon", "Deflasyon", "Hiperenflasyon"],
      correct: ["Deflasyon"],
    }) as QuizQuestion;
    const twin = readTwinQuestion(
      {
        text: "Tüketici fiyatlarının genel düzeyi dönemler boyunca azalıyor. Bu olgu hangi kavramla adlandırılır?",
        options: ["A) Stagflasyon", "B) Enflasyon", "C) Dezenflasyon", "D) Deflasyon", "E) Hiperenflasyon"],
        correct: ["D) Deflasyon"],
      },
      original,
    );
    expect(twin?.options.every((option) => !/^[A-E]\)/.test(option))).toBe(true);
    expect(twin?.correct).toEqual(["Deflasyon"]);
    const bare = readTwinQuestion(
      {
        text: "Tüketici fiyatlarının genel düzeyi dönemler boyunca azalıyor. Bu olgu hangi kavramla adlandırılır?",
        options: ["A) Stagflasyon", "B) Enflasyon", "C) Dezenflasyon", "D) Deflasyon", "E) Hiperenflasyon"],
        correct: ["D"],
      },
      original,
    );
    expect(bare?.correct).toEqual(["Deflasyon"]);
    // Yalnız bazı şıklar harfle başlıyorsa (ör. "A vitamini") metne dokunulmaz.
    const vitamins = readTwinQuestion(
      { text: "Hangi vitamin yağda çözünür ve gece görmeyle ilgilidir?", options: ["A vitamini", "B12 vitamini", "C vitamini", "Folik asit", "Niasin"], correct: ["A vitamini"] },
      normalizeQuizQuestion({ text: "Hangi vitamin suda çözünür?", options: ["A vitamini", "B12 vitamini", "C vitamini", "D vitamini", "K vitamini"], correct: ["C vitamini"] }) as QuizQuestion,
    );
    expect(vitamins?.correct).toEqual(["A vitamini"]);
  });

  it("cevap anahtarı şifreli belirteçte: açılır, kurcalanırsa ve süresi dolarsa açılmaz", () => {
    const secret = "test-secret";
    const token = sealTwin({ attemptId: "a1", index: 2, correct: ["6"], explanation: "a = 6" }, secret, 1_000);
    expect(token).not.toContain("6\"");
    expect(openTwin(token, secret, 2_000)).toMatchObject({ a: "a1", i: 2, c: ["6"], x: "a = 6" });
    expect(openTwin(token, "başka", 2_000)).toBeNull();
    const broken = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(openTwin(broken, secret, 2_000)).toBeNull();
    expect(openTwin(token, secret, 1_000 + 7 * 60 * 60 * 1000)).toBeNull();
  });

  it("iki şık ipucu cevabı ele vermez", () => {
    const question = normalizeQuizQuestion({
      text: "Kromozomların ekvatoral düzlemde dizildiği evre hangisidir?",
      options: ["Profaz", "Metafaz", "Anafaz", "Telofaz"],
      correct: ["Metafaz"],
    }) as QuizQuestion;
    const pair: [string, string] = ["Metafaz", "Anafaz"];
    expect(readTwoOptionHint({ hint: "Doğru cevap metafazdır çünkü kromozomlar dizilir." }, question, pair)).toBeNull();
    expect(readTwoOptionHint({ hint: "Metafaz kromozomların hücrenin ortasında sıralandığı evredir." }, question, pair)).toBeNull();
    expect(
      readTwoOptionHint({ hint: "Metafazda kromozomların konumuna, anafazda ise kromatitlerin hareketine bak." }, question, pair),
    ).toBe("Metafazda kromozomların konumuna, anafazda ise kromatitlerin hareketine bak.");
  });

  it("uçlar soruyu sunucudaki kayıttan okur; yıldız soru başına bir kez ve tek cevapla", () => {
    const twin = read("src/app/api/learning/twin-question/route.ts");
    expect(twin).toContain("loadAttemptQuizQuestion(");
    expect(twin).toContain("ref: `twin:${seal.a}:${seal.i}`");
    expect(twin).toContain("firstAnswer");
    expect(read("src/app/api/learning/two-option-hint/route.ts")).toContain("TWO_OPTION_FALLBACK");
  });
});

describe("#12 ekran", () => {
  it("ikiz soru düğmesi soruyu açar, cevabı sunucuya gönderir ve sonucu yazar", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ question: { text: "İkiz kök?", options: ["3", "6", "9"], multi: false }, token: "t".repeat(40) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ correct: true, correctOptions: ["6"], explanation: "a = 6", message: "👏 İkiz soruyu çözdün! +5 ⭐" }) });
    vi.stubGlobal("fetch", fetch);
    render(<TwinQuestionCard attemptId="11111111-1111-4111-8111-111111111111" index={1} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TWIN_BUTTON }));
    });
    fireEvent.click(screen.getByRole("radio", { name: /6/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    });
    const sent = JSON.parse(String((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(sent).toEqual({ action: "answer", token: "t".repeat(40), answer: "6" });
    expect(screen.getByRole("status").textContent).toContain("👏 İkiz soruyu çözdün! +5 ⭐");
  });

  it("iki şık seçilince ipucu istenir ve soru ipuçlu sayılır; hata olursa sabit yönlendirme", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const used = vi.fn();
    render(<TwoOptionHint attemptId="11111111-1111-4111-8111-111111111111" index={0} options={["Profaz", "Metafaz", "Anafaz"]} onUsed={used} />);
    fireEvent.click(screen.getByRole("button", { name: TWO_OPTION_CHIP }));
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "B" }));
    });
    expect(used).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain(TWO_OPTION_FALLBACK);
  });

  it("test ekranında iki şık çipi cevaptan önce, ikiz soru yalnız yanlış cevaptan sonra", () => {
    const base = {
      questions: [{ text: "Hangi evre?", options: ["Profaz", "Metafaz"], multi: false, correct: ["Metafaz"] }],
      index: 0,
      onChange: () => undefined,
      onContinue: () => undefined,
      continueLabel: "Testi bitir",
      twin: () => <span>ikiz-yuvası</span>,
      twoOption: () => <span>iki-şık-yuvası</span>,
    };
    const wrong = render(<ExamQuizPlay {...base} value="Profaz" />);
    expect(screen.getByText("iki-şık-yuvası")).toBeTruthy();
    expect(screen.queryByText("ikiz-yuvası")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    expect(screen.queryByText("iki-şık-yuvası")).toBeNull();
    expect(screen.getByText("ikiz-yuvası")).toBeTruthy();
    wrong.unmount();
    render(<ExamQuizPlay {...base} value="Metafaz" />);
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    expect(screen.queryByText("ikiz-yuvası")).toBeNull();
  });
});
