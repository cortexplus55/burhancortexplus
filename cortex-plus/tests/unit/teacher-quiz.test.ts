import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  parseQuizIssues,
  quizDifficulty,
  parseTeacherQuiz,
  quizStructureIssues,
  quizSystem,
  quizUserPrompt,
  quizVerifySystem,
  shuffleOptions,
} from "@/lib/learning/teacher-quiz";
import { minimumQuestions, teacherQuizLoop, withOneMultiLast } from "@/lib/learning/teacher-quiz-run";
import { multiPartialPercent } from "@/lib/learning/exam-quiz";

/*
  Öğretmen test motoru (2 Ekim 2026). Altın denemede KPSS 5/5 ve Termodinamik
  5/7 soru geçti; denetçi "n = 0 hem izobarik hem politropik" gibi iki doğru
  savunulabilen soruları kendisi çözerek yakaladı.
*/
const raw = (text: string, correct = "Yokluk") => ({
  text,
  options: ["Yokluk", "Mutlak butlan", "Nispi butlan", "Tek taraflı bağlamazlık"],
  correct,
  multi: false,
  explanation: "Kurucu unsur eksikse işlem hiç doğmamıştır; diğerlerinde işlem doğmuştur.",
  optionWhy: [
    "Kurucu unsur eksik olduğu için işlem hiç doğmamıştır.",
    "Mutlak butlanda işlem doğmuş ama kesin geçersizdir.",
    "Nispi butlan irade sakatlığında iptal hakkı verir.",
    "Tek taraflı bağlamazlıkta işlem onaya kadar askıdadır.",
  ],
  misconceptionTag: "yokluk-butlan karışıklığı",
  learningObjective: "Kurucu unsur eksikliğini yoklukla eşleştirir.",
});

describe("öğretmen test motoru: biçim ve yapı", () => {
  it("model çıktısı soru tipine oturur; metne dokunulmaz", () => {
    const parsed = parseTeacherQuiz({ questions: [raw("Nikâh memuru olmadan yapılan evlilik hangi durumdadır?")] });
    expect(parsed?.[0].correct).toEqual(["Yokluk"]);
    expect(parsed?.[0].text).toBe("Nikâh memuru olmadan yapılan evlilik hangi durumdadır?");
    expect(parseTeacherQuiz({ items: [] })).toBeNull();
  });

  it("sağlam soru yapı denetiminden geçer", () => {
    const [question] = parseTeacherQuiz({ questions: [raw("Nikâh memuru olmadan yapılan evlilik hangi durumdadır?")] })!;
    expect(quizStructureIssues(question)).toEqual([]);
  });

  it("eski kusurlar yakalanır: hepsi şıkkı, sayma sorusu, cevabı veren kök, eksik gerekçe, hesapla çelişen anahtar", () => {
    const hepsi = parseTeacherQuiz({
      questions: [{ ...raw("Hangisi hükümsüzlük türüdür?"), options: ["Yokluk", "Mutlak butlan", "Nispi butlan", "Hepsi"] }],
    })![0];
    expect(quizStructureIssues(hepsi).join(" ")).toMatch(/Hepsi/);
    const counting = parseTeacherQuiz({ questions: [raw("Hükümsüzlük kaç ana başlıkta incelenir?")] })![0];
    expect(quizStructureIssues(counting).join(" ")).toMatch(/Sayma/);
    const giveaway = parseTeacherQuiz({ questions: [raw("Tek taraflı bağlamazlık nedir, hangisi tek taraflı bağlamazlıktır?", "Tek taraflı bağlamazlık")] })![0];
    expect(quizStructureIssues(giveaway).join(" ")).toMatch(/cevabı veriyor/);
    const noWhy = parseTeacherQuiz({ questions: [{ ...raw("Nikâh memuru olmadan yapılan evlilik?"), optionWhy: ["tek satır gerekçe yazıldı"] }] })![0];
    expect(quizStructureIssues(noWhy).join(" ")).toMatch(/optionWhy/);
    const exponent = parseTeacherQuiz({
      questions: [{ ...raw("(3⁴)² ifadesinin değeri hangisidir?", "3¹²"), options: ["3⁸", "3¹²", "3⁶", "3¹⁶"] }],
    })![0];
    expect(quizStructureIssues(exponent).join(" ")).toMatch(/hesapla çelişiyor/);
  });

  // 29 Eylül canlı quiz (#189): C ve D aynı iki nokta; öğrenci gerçek cevabı
  // seçti, yanlış sayıldı. Gerekçeler şıkkı tekrar edip "olamaz" diyordu.
  it("aynı noktalar farklı sırayla iki şık olunca soru düzeltmeye gider; istemler kuralı söylüyor", () => {
    const sameSet = parseTeacherQuiz({
      questions: [
        {
          ...raw("Birim çemberde 0° ile 90° arasındaki açıların noktaları hangi iki nokta arasındadır?", "(1, 0) ve (0, 1) arasında"),
          options: ["(cos A, sin A) değerleri arasında", "(1, 0) ve (-1, 0) arasında", "(1, 0) ve (0, 1) arasında", "(0, 1) ve (1, 0) arasında"],
        },
      ],
    })![0];
    expect(quizStructureIssues(sameSet).join(" ")).toMatch(/İki şık aynı cevap/);
    for (const prompt of [quizSystem("document"), quizSystem("topic")]) {
      expect(prompt).toContain("İki şık aynı şeyi söylemez");
      expect(prompt).toContain("yalnız 'olamaz / değildir' demek gerekçe değildir");
    }
    for (const prompt of [quizVerifySystem("document"), quizVerifySystem("topic")]) {
      expect(prompt).toContain("iki şık aynı şeyi farklı sırayla");
      expect(prompt).toContain("şıkkı tekrar edip yalnız 'olamaz / değildir' demesi");
    }
  });

  it("denetçi sorunları soru sırasıyla okunur; ciddiyet yoksa yüksek", () => {
    expect(parseQuizIssues({ issues: [{ question: 2, problem: "İki doğru şık" }, { question: "x", problem: "y" }, { question: 1, severity: "low", problem: "kolay" }] })).toEqual([
      { question: 2, severity: "high", problem: "İki doğru şık", fix: undefined },
      { question: 1, severity: "low", problem: "kolay", fix: undefined },
    ]);
  });

  it("istem: kaynak kuralı, kardeş çeldirici, kendi çözümü; belgesizde doğruluk kuralı; denetçi önce çözer", () => {
    const system = quizSystem("document");
    expect(system).toContain("KAYNAK KURALI (kesin)");
    expect(system).toContain("kardeş terimler");
    expect(system).toContain("Yazmadan önce her soruyu kendin çöz");
    expect(quizSystem("topic")).toContain("BİLGİ KURALI (belgesiz, kesin)");
    expect(quizSystem("document", "gaps")).toContain("TUZAK SORULARI");
    expect(quizVerifySystem("document")).toContain("HER SORUYU ÖNCE KENDİN ÇÖZ");
    expect(quizVerifySystem("topic")).toContain("Belgesi olmayan");
  });
});

describe("öğretmen test motoru: döngü", () => {
  const draft = (n: number) => ({ questions: Array.from({ length: n }, (_, i) => raw(`Soru ${i + 1}: nikâh memuru olmadan yapılan evlilik?`)) });
  const input = { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "Yokluk…" }], count: 5 };

  it("yedekli taslak: denetçinin elediği sorular yerine yedekler geçer, düzeltme turu gerekmez", async () => {
    const calls: string[] = [];
    const ask = vi.fn(async (system: string) => {
      calls.push(system.slice(0, 40));
      if (system.includes("denetçisisin")) return { issues: [{ question: 1, problem: "İki doğru şık" }, { question: 4, problem: "Anahtar yanlış" }] };
      return draft(7);
    });
    const loop = await teacherQuizLoop(ask, input);
    expect(loop.questions).toHaveLength(5);
    expect(loop.rounds).toBe(0);
    expect(loop.questions.map((q) => q.text)).not.toContain("Soru 2: nikâh memuru olmadan yapılan evlilik?");
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("yeterli soru kalmazsa yalnız sorunlu sorular düzeltmeye gider", async () => {
    let verify = 0;
    const ask = vi.fn(async (system: string) => {
      if (system.includes("denetçisisin")) {
        verify += 1;
        return verify === 1 ? { issues: [0, 1, 2, 3].map((question) => ({ question, problem: "Anahtar yanlış" })) } : { issues: [] };
      }
      if (system.startsWith("Sen aynı testi yazan")) return draft(4);
      return draft(7);
    });
    const loop = await teacherQuizLoop(ask, input);
    expect(loop.rounds).toBe(1);
    expect(loop.questions).toHaveLength(5);
  });

  it("asgari soru sayısı", () => {
    expect(minimumQuestions(5)).toBe(3);
    expect(minimumQuestions(8)).toBe(6);
  });
});

describe("şık karıştırma ve eski çağıranlar", () => {
  it("şıklar gerekçeleriyle birlikte sabit sırayla karışır; doğru cevap farklı konumlara düşer", () => {
    const questions = Array.from({ length: 12 }, (_, i) => parseTeacherQuiz({ questions: [raw(`Soru ${i}: nikâh memuru olmadan yapılan evlilik hangi durumdadır?`)] })![0]);
    const shuffled = questions.map(shuffleOptions);
    for (const [index, question] of shuffled.entries()) {
      // Her şık kendi gerekçesiyle kalır.
      for (const option of question.options) {
        const original = questions[index].options.indexOf(option);
        expect(question.optionWhy![question.options.indexOf(option)]).toBe(questions[index].optionWhy![original]);
      }
      expect(question.correct).toEqual(["Yokluk"]);
      // Aynı soru her seferinde aynı sırada.
      expect(shuffleOptions(questions[index]).options).toEqual(question.options);
    }
    const positions = new Set(shuffled.map((question) => question.options.indexOf("Yokluk")));
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });

  it("hazır kaynak bloğu ve çağıranın isteği istemde", () => {
    const prompt = quizUserPrompt({ topicLabel: "", prepTitle: "", pages: [], sourceBlock: "[s.8] Yokluk…", brief: "Tam 4 soru; tür planı: mcq", count: 4 });
    expect(prompt).toContain("KAYNAK:\n[s.8] Yokluk…");
    expect(prompt).toContain("İSTEK (kurallarla çelişirse kurallar geçerli):\nTam 4 soru");
    expect(prompt).not.toContain("SINAV:");
  });

  it("test üreticisi yalnız öğretmen motoru; eski zincir yok", () => {
    const source = readFileSync("src/lib/learning/exam-quiz-generate.ts", "utf8");
    expect(source).toContain("const outcome = await runTeacherQuiz(input.service, {");
    expect(source).not.toContain("generateJson");
    expect(source).toContain("deferCommit: input.deferCommit,");
    for (const caller of [
      "src/app/api/learning/exam-prep/duel/route.ts",
      "src/app/api/learning/exam-prep/intro/route.ts",
      "src/lib/learning/mock-exam/create.ts",
      "src/lib/learning/diagnostic-generate.ts",
      "src/app/api/learning/quiz/generate/route.ts",
    ]) {
      expect(readFileSync(caller, "utf8")).toMatch(/count: /);
    }
  });
});

describe("rota test düğümünü öğretmen motoruna yollar", () => {
  it("konu testi ve tuzak soruları yalnız öğretmen motorundan; çekirdek sayfa ya da belgesiz", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain('const TEACHER_QUIZ_KINDS = new Set<PlanNodeKind>(["quiz", "gaps"]);');
    expect(route).toContain("return teacherQuizPayload(input, activity, core, Math.max(5, quizCount));");
    // Eski zincir ve motor anahtarları 3 Ekim 2026'da silindi.
    expect(readFileSync("src/lib/env.ts", "utf8")).not.toMatch(/(LESSON|QUIZ|PODCAST|CARDS|PRACTICE)_ENGINE: z/);
    expect(route).toContain('const noPages = () => new NodeGenerationError(503, "source_unavailable", ["lesson_core_missing"]);');
  });
});

// Faz 5 ikinci tur (16 Ekim 2026): "Orta" seçilen Pediatri konu testi tanım
// sorularıyla ve eleyerek bulunan şıklarla geldi ("Sosyal gülümseme" bir ölçüm
// sorusunda). Kaydırıcı yazara hiç ulaşmıyordu.
describe("zorluk ve çeldirici kategorisi", () => {
  it("öğrencinin seçtiği zorluk yazara satır olarak gider; tanınmayan değer gitmez", () => {
    const base = { topicLabel: "Büyüme", prepTitle: "Pediatri", pages: [{ page: 1, text: "Büyüme niceliksel artıştır." }], count: 5 };
    expect(quizUserPrompt({ ...base, difficulty: "orta" })).toContain("ZORLUK: orta — soruların yarısından çoğu kısa bir vakayla açılır");
    expect(quizUserPrompt({ ...base, difficulty: "ileri" })).toContain("tanım sorusu yok");
    expect(quizUserPrompt(base)).not.toContain("ZORLUK:");
    expect(quizDifficulty("ileri")).toBe("ileri");
    expect(quizDifficulty("hard")).toBe("ileri");
    expect(quizDifficulty("Zorluk: tanı yüksek.")).toBeUndefined();
  });

  it("yazar ve iki denetçi çeldiricinin aynı kategoriden olmasını biliyor", () => {
    for (const mode of ["document", "topic"] as const) {
      expect(quizSystem(mode)).toContain("Dört şık da sorulan kategoriden olur");
      expect(quizVerifySystem(mode)).toContain("G) Çeldiricinin sorulan kategoriden olmaması");
      expect(quizVerifySystem(mode)).toContain("A-G 'high'");
      // Canlı Pediatri testi (16 Ekim): doğru şık en uzundu; tek "ağır" küme üç "hafif"in arasındaydı.
      expect(quizSystem(mode)).toContain("doğru şık en uzun ya da tek ayrıntılı şık olmaz");
      expect(quizVerifySystem(mode)).toContain("çeldiricinin doğru şıkkın olumsuz kopyası olması");
    }
  });

  it("konu testi kaydırıcının ham değerini taşır; tanı ve tanışma testinin sabit 'hard'ı yazara gitmez", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("requestedDifficulty: difficulty,");
    expect(route).toContain("difficulty: quizDifficulty(input.requestedDifficulty),");
    const generate = readFileSync("src/lib/learning/exam-quiz-generate.ts", "utf8");
    expect(generate).toContain("difficulty: quizDifficulty(input.studentDifficulty),");
  });
});

// Canlı Pediatri testi (16 Ekim 2026): kök "annede B12 eksikliği" diyip hangi eksiklik diye sordu;
// bir başka soru "hangi gerekçe belirtilmiştir" diye kaynağa sordu.
describe("kök cevabı ele vermez, kaynağa sormaz", () => {
  const base = {
    multi: false,
    explanation: "Makrositoz ve nörolojik bulgu B12 eksikliğini düşündürür.",
    optionWhy: ["a", "b", "c", "d"],
  };
  it("tek rakamlı cevap da kökte geçerse yakalanır (23 Ekim 2026 podcast kontrolü)", () => {
    const leaky = {
      ...base,
      text: "Bir bebek 6 aylıkken destekli oturuyor ve dönüyor. Bu beceriler hangi yaş basamağıyla uyumludur?",
      options: ["6 ay", "2 ay", "9 ay", "12 ay"],
      correct: ["6 ay"],
    };
    expect(quizStructureIssues(leaky as never).some((issue) => /ele veren kelimeyi içeriyor \('6'\)/.test(issue))).toBe(true);
    const clean = { ...leaky, text: "Bir bebek destekli oturuyor ve dönüyor. Bu beceriler hangi yaş basamağıyla uyumludur?" };
    expect(quizStructureIssues(clean as never).some((issue) => /ele veren/.test(issue))).toBe(false);
  });
  it("yalnız doğru şıkta olan kelime kökte geçerse yakalanır", () => {
    const leaky = {
      ...base,
      text: "Annede B12 eksikliği olan bebekte makrositoz var. Hangi mikrobesin eksikliği düşünülür?",
      options: ["Demir", "A vitamini", "D vitamini", "B12 vitamini"],
      correct: ["B12 vitamini"],
    };
    expect(quizStructureIssues(leaky as never).some((issue) => /ele veren kelimeyi içeriyor \('b12'\)/.test(issue))).toBe(true);
    const clean = { ...leaky, text: "Yalnız anne sütü alan bebekte makrositoz ve nörolojik bulgu var. Hangi mikrobesin eksikliği düşünülür?" };
    expect(quizStructureIssues(clean as never).some((issue) => /ele veren/.test(issue))).toBe(false);
    // Bütün şıklarda geçen kelime (vitamini) ipucu sayılmaz.
    const shared = { ...clean, text: "Bebekte makrositoz var; hangi vitamini eksik olabilir?", options: ["A vitamini", "D vitamini", "E vitamini", "B12 vitamini"] };
    expect(quizStructureIssues(shared as never).some((issue) => /ele veren/.test(issue))).toBe(false);
  });

  it("'belirtilmiştir' kaynağa sorar: yazar yasağı ve yapı denetimi", () => {
    expect(quizSystem("document")).toContain("'belirtilmiştir'");
    const sourced = {
      ...base,
      text: "İnek sütünün erken dönemde ana içecek olmaması için hangi gerekçe belirtilmiştir?",
      options: ["Demir düşük", "Kalsiyum yüksek", "Protein düşük", "Yağ yüksek"],
      correct: ["Demir düşük"],
    };
    expect(quizStructureIssues(sourced as never).some((issue) => /kaynak\/sayfa notu ya da 'metne göre'/.test(issue))).toBe(true);
  });
});

// 17 Ekim 2026, ürün sahibi: çok cevaplı soru eklensin. Astra'nın konu testinde 7 sorudan
// sonuncusu çok cevaplıydı ("BİRDEN FAZLA YANIT SEÇEBİLİRSİN"), kısmi puanla ("%50 doğru").
describe("çok cevaplı soru", () => {
  const multi = {
    text: "Aşağıdakilerden hangileri krup tablosunda beklenir?",
    options: ["Havlar tarzda öksürük", "İnspiratuvar stridor", "Fokal ral", "Ekspiratuvar uzama"],
    correct: ["Havlar tarzda öksürük", "İnspiratuvar stridor"],
    multi: true,
    explanation: "Krup subglottik ödemle havlar öksürük ve inspiratuvar stridor yapar; fokal ral pnömoniye, ekspiratuvar uzama alt hava yoluna aittir.",
    optionWhy: ["Krupun tipik öksürüğüdür.", "Üst hava yolu daralmasının sesidir.", "Pnömonide duyulur.", "Alt hava yolu tıkanmasında görülür."],
  };

  it("yalnız konu testi açar; yazar tam bir soru yazar, öteki testler tek cevaplı kalır", () => {
    expect(quizSystem("document", "practice", true)).toContain("ÇOK CEVAPLI SORU: Bu testte tam bir soru çok cevaplıdır");
    expect(quizSystem("document", "practice")).not.toContain("ÇOK CEVAPLI SORU:");
    expect(quizSystem("topic", "practice", true)).toContain("2 ya da 3'ü doğru");
    for (const mode of ["document", "topic"] as const) {
      expect(quizVerifySystem(mode)).toContain("multi true olan soruda (çok cevaplı) birden fazla doğru şık olması B değildir");
    }
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain('multi: input.kind === "quiz" && count >= 5,');
  });

  it("yapı: izin varsa 2-3 doğru geçer; izin yoksa ya da doğru sayısı tutmazsa düzeltmeye gider", () => {
    expect(quizStructureIssues(multi as never, { multi: true })).toEqual([]);
    expect(quizStructureIssues(multi as never).join(" ")).toMatch(/Tek doğru şık olmalı/);
    const one = { ...multi, correct: ["Havlar tarzda öksürük"] };
    expect(quizStructureIssues(one as never, { multi: true }).join(" ")).toMatch(/1 doğru var; 2 ya da 3 olmalı/);
    const all = { ...multi, correct: [...multi.options] };
    expect(quizStructureIssues(all as never, { multi: true }).join(" ")).toMatch(/4 doğru var/);
    const leaky = { ...multi, text: "Stridor duyulan çocukta krupta hangileri beklenir?" };
    expect(quizStructureIssues(leaky as never, { multi: true }).join(" ")).toMatch(/ele veren kelimeyi içeriyor \('stridor'\)/);
  });

  it("testte en çok bir çok cevaplı soru ve o sonda; yedekler kesilirken düşmez", () => {
    const single = (n: number) => ({ ...multi, text: `Soru ${n}`, multi: false, correct: ["Fokal ral"] }) as never;
    const pool = [single(1), multi as never, single(2), single(3), single(4), single(5), { ...multi, text: "İkinci çok cevaplı" } as never];
    const kept = withOneMultiLast(pool, 5);
    expect(kept).toHaveLength(5);
    expect(kept.filter((question) => (question as { multi: boolean }).multi)).toHaveLength(1);
    expect((kept[4] as { text: string }).text).toBe(multi.text);
    expect(withOneMultiLast([single(1), single(2)], 5)).toHaveLength(2);
  });

  it("kısmi puan: (doğru seçilen − yanlış seçilen) / doğru sayısı", () => {
    expect(multiPartialPercent(["Havlar tarzda öksürük"], multi.correct)).toBe(50);
    expect(multiPartialPercent(multi.correct, multi.correct)).toBe(100);
    expect(multiPartialPercent(["Havlar tarzda öksürük", "Fokal ral"], multi.correct)).toBe(0);
    expect(multiPartialPercent(["Fokal ral"], multi.correct)).toBe(0);
  });
});
