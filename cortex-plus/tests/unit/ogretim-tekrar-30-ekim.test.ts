import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TEACHER_SYSTEM,
  TOPIC_TEACHER_SYSTEM,
  echoedCheck,
  lessonTeachingFlags,
  repetitionIssues,
  screenEcho,
  screenStructureIssues,
  screenTwinSentence,
  verifySystem,
} from "@/lib/learning/teacher-lesson";
import {
  OFF_KIND_PREFIX,
  STEM_ECHO_PREFIX,
  STEM_ECHO_RULE,
  UNSALVAGEABLE_PROBLEM,
  appendWithoutConflicts,
  parseTeacherQuiz,
  questionConflict,
  quizSetIssues,
  quizStructureIssues,
  quizSystem,
  quizVerifySystem,
  salvageRejected,
} from "@/lib/learning/teacher-quiz";
import {
  CARD_DISTINCT_RULE,
  cardSetIssue,
  cardsSystem,
  cardsVerifySystem,
  formulaLetterCard,
  mergeDistinctCards,
  sameCardFact,
  teacherCardsLoop,
  type TeacherCard,
} from "@/lib/learning/teacher-cards";
import { TF_SAME_FACT_OVERLAP, factKeys, sameDefinedSubject, sameTrueFalseFact } from "@/lib/learning/true-false-quality";
import { TRUE_FALSE_PAIR_RULE, trueFalseSystem, trueFalseVerifySystem } from "@/lib/learning/teacher-practice";
import { SAME_KIND_DISTRACTOR_RULE, TEST_SET_RULE, THRESHOLD_OPTIONS_RULE } from "@/lib/learning/teaching-rubric";
import { askedKind, offKindDistractors, termKind } from "@/lib/learning/distractor-kind";
import { THRESHOLD_TWIN_PREFIX, singleAnswerIntegrityIssues, thresholdTwinOptions } from "@/lib/learning/question-integrity";
import { sameRoot, stemPhraseInAnswer } from "@/lib/learning/lexical-overlap";
import type { LessonBlock, LessonScreen } from "@/lib/learning/lesson-v3";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/*
  Canlı tur (30 Ekim 2026, Makroekonomi notu): ders, kartlar, doğru/yanlış, Araçlar testi, yazılı deneme ve düelloda
  görülen öğretim kusurları. Her kural ders-bağımsız; örnekler en az üç dersten (ekonomi, biyoloji, hukuk/tarih,
  fizik). Kod metne dokunmaz: işaretler, düşürür ya da yeniden ister.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

/* ───────────── yardımcılar ───────────── */

const text = (value: string) => ({ type: "text", text: value }) as LessonBlock;
const tfCheck = (prompt: string, answerIndex = 0) =>
  ({
    type: "check",
    check: { type: "trueFalse", prompt, options: ["Doğru", "Yanlış"], answerIndex, explanation: "Kısa ve kendine özgü bir gerekçe." },
  }) as LessonBlock;
const mcqCheck = (prompt: string, options: string[], answerIndex: number) =>
  ({
    type: "check",
    check: {
      type: "mcq",
      prompt,
      options,
      answerIndex,
      explanation: "Doğru cevabın nedeni ve öbür şıkların gerçekte ne olduğu kısaca anlatılır.",
      optionWhy: options.map((option) => `${option} için kendine özgü bir gerekçe.`),
    },
  }) as LessonBlock;
const screen = (heading: string, blocks: LessonBlock[]): LessonScreen => ({ heading, concept: heading, blocks });

const question = (textValue: string, options: string[], correct: string, extra: Partial<QuizQuestion> = {}): QuizQuestion => ({
  text: textValue,
  options,
  correct: [correct],
  multi: false,
  explanation: "Doğru cevabın nedeni ve öbür şıkların gerçekte neye karşılık geldiği kısaca anlatılır.",
  optionWhy: options.map((option) => `${option} için kendine özgü bir gerekçe.`),
  misconceptionTag: "kavram karışıklığı",
  learningObjective: "Kavramı ayırt eder.",
  ...extra,
});

/* ───────────── 1. Ders: ekran içi tekrar ───────────── */

describe("1 · ders: aynı bilgi bir ekranda üç biçimde, aynı tanım iki kez, soru üstteki cümlenin aynısı", () => {
  // Canlıdaki Makroekonomi ekranı: metin, "Ayırt et" kartı, hafıza çivisi, tablo ve karşılaştırma kartı aynı cümleyi söylüyor.
  const economics = screen("Deflasyon", [
    text("**Deflasyon**, genel fiyat düzeyinin sürekli düşmesidir. Bir ekonomide fiyatlar aylarca geriler."),
    {
      type: "exam_trap_card",
      trap: {
        title: "Deflasyon ile dezenflasyon",
        wrong: "Enflasyon oranı düşüyorsa deflasyon vardır.",
        right: "Deflasyon genel fiyat düzeyinin sürekli düşmesidir.",
      },
    } as LessonBlock,
    { type: "memory_hook_card", hook: { kind: "shortcut", title: "Kısa yol", body: "Deflasyon: genel fiyat düzeyi sürekli düşer." } } as LessonBlock,
    {
      type: "table",
      table: { columns: ["Kavram", "Tanım"], rows: [["Deflasyon", "Genel fiyat düzeyinin sürekli düşmesi"], ["Enflasyon", "Genel fiyat düzeyinin sürekli artması"]] },
    } as LessonBlock,
    tfCheck("Deflasyon, genel fiyat düzeyinin sürekli düşmesidir."),
  ]);

  it("ekonomi: beş biçim işaretlenir (medium), soru üstteki cümleyi geri soruyor", () => {
    const echo = screenEcho(economics);
    expect(echo?.kinds.length).toBeGreaterThanOrEqual(2);
    expect(echoedCheck(economics)).toContain("genel fiyat düzeyinin sürekli düşmesidir");
    const issues = repetitionIssues([economics], [0]);
    expect(issues.every((issue) => issue.severity === "medium")).toBe(true);
    expect(issues.some((issue) => /biçimde/.test(issue.problem))).toBe(true);
    expect(issues.some((issue) => /hemen üstündeki cümleyi geri soruyor/.test(issue.problem))).toBe(true);
  });

  it("biyoloji: aynı tanım bir ekranda iki kez (metin ve not)", () => {
    const biology = screen("Mitoz", [
      text("Mitoz, bir hücrenin iki özdeş yavru hücreye bölünmesidir. Kromozom sayısı korunur."),
      { type: "note", note: { title: "Akılda tut", body: "Mitoz bir hücrenin iki özdeş yavru hücreye bölünmesidir.", tone: "remember" } } as LessonBlock,
      mcqCheck("Deri hücresi yenilenirken hangi bölünme görülür?", ["Mitoz", "Mayoz", "Tomurcuklanma", "Döllenme"], 0),
    ]);
    expect(screenTwinSentence(biology)).toContain("iki özdeş yavru hücreye");
    expect(repetitionIssues([biology], [0]).some((issue) => issue.severity === "medium" && /iki kez/.test(issue.problem))).toBe(true);
    // Yeni bir durumda soran soru üstteki cümleyi geri sormuyor.
    expect(echoedCheck(biology)).toBeNull();
  });

  it("hukuk: kart yeni bir ipucu taşıyorsa ve soru yeni durumda soruyorsa işaret yok; 'önce dene' sorusu sayılmaz", () => {
    const law = screen("Yokluk", [
      tfCheck("Resmî memur önünde yapılmayan evlilik iptal edilene kadar geçerlidir.", 1),
      text("Yokluk, kurucu unsuru eksik işlemin hiç doğmamasıdır. Kimsenin ileri sürmesi gerekmez."),
      {
        type: "exam_trap_card",
        trap: {
          title: "Yokluk ile butlan",
          wrong: "Yok hükmündeki işlem dava açılınca ortadan kalkar.",
          right: "Yok hükmündeki işlem hiç doğmamıştır.",
          tell: "Mahkeme kararı gerekmiyorsa yokluk, karar gerekiyorsa iptal düşünülür.",
        },
      } as LessonBlock,
    ]);
    expect(screenEcho(law)).toBeNull();
    expect(echoedCheck(law)).toBeNull();
    expect(repetitionIssues([law], [0])).toEqual([]);
  });

  it("canlıda sayı olarak günlüğe yazılır; yayın kodu metne dokunmaz", () => {
    expect(lessonTeachingFlags([economics])).toMatchObject({ echo: 1, echoedCheck: 1 });
    const run = read("src/lib/learning/teacher-lesson-run.ts");
    expect(run).toContain('console.info("teacher_lesson_teaching_flags"');
    expect(run).toContain("lessonTeachingFlags(fresh, input)");
  });

  it("ölçüt yazar ve denetçide aynı metin", async () => {
    const { TEACHING_RUBRIC } = await import("@/lib/learning/teaching-rubric");
    expect(TEACHING_RUBRIC).toContain("Aynı ekranda bir bilgi en çok iki biçimde durur");
    expect(TEACHER_SYSTEM).toContain(TEACHING_RUBRIC);
    expect(verifySystem("document")).toContain(TEACHING_RUBRIC);
  });
});

/* ───────────── 2. Çeldirici türü ───────────── */

describe("2 · çeldirici doğru cevapla aynı türden (tek cevaplı ders ve test sorusu)", () => {
  it("kural ders ve test yazarında, iki denetçide aynı metin", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM, verifySystem("document"), verifySystem("topic")]) {
      expect(system).toContain(SAME_KIND_DISTRACTOR_RULE);
      expect(system).toContain(THRESHOLD_OPTIONS_RULE);
    }
    for (const mode of ["document", "topic"] as const) {
      expect(quizSystem(mode)).toContain(SAME_KIND_DISTRACTOR_RULE);
      expect(quizVerifySystem(mode)).toContain(SAME_KIND_DISTRACTOR_RULE);
    }
    expect(quizSystem("document", "practice", false, undefined, true)).toContain(SAME_KIND_DISTRACTOR_RULE);
    expect(quizVerifySystem("document", undefined, true)).toContain(SAME_KIND_DISTRACTOR_RULE);
  });

  it("ekonomi: endeks sorusunda enflasyon türleri sorulan türden değil (kaynağın tanım cümlesinden)", () => {
    const context =
      "TÜFE, tüketicilerin satın aldığı mal ve hizmetlerin fiyat değişimini ölçen bir endekstir. " +
      "ÜFE, üreticilerin sattığı malların fiyat değişimini ölçen endekstir. " +
      "Dezenflasyon, enflasyon oranının düşmesidir. Stagflasyon, durgunluk ile yüksek enflasyonun birlikte görülmesidir.";
    const stem = "Hanehalkının aldığı mal ve hizmetlerdeki fiyat değişimini izlemek için kullanılan endeks hangisidir?";
    expect(askedKind(stem)).toBe("endek");
    expect(termKind("Dezenflasyon", context)).toBe("düşme");
    expect(offKindDistractors({ stem, options: ["TÜFE", "ÜFE", "Dezenflasyon", "Stagflasyon"], correctIndex: 0, context })).toEqual([
      "Dezenflasyon",
      "Stagflasyon",
    ]);
  });

  it("biyoloji: hormon sorusunda organ; hukuk: mahkeme sorusunda kurum", () => {
    const bio =
      "İnsülin, pankreastan salgılanan bir hormondur. Glukagon, kan şekerini yükselten bir hormondur. " +
      "Pankreas, hem endokrin hem ekzokrin bir bezdir. Karaciğer, glikojen depolayan bir organdır.";
    expect(
      offKindDistractors({
        stem: "Kan şekerini düşüren hormon hangisidir?",
        options: ["İnsülin", "Glukagon", "Pankreas", "Karaciğer"],
        correctIndex: 0,
        context: bio,
      }),
    ).toEqual(["Pankreas", "Karaciğer"]);
    const law =
      "Danıştay, idari yargının en yüksek mahkemesidir. Yargıtay, adli yargının en yüksek mahkemesidir. " +
      "Sayıştay, kamu harcamalarını denetleyen bir kurumdur.";
    expect(
      offKindDistractors({
        stem: "İdari yargıda son inceleme mercii olan mahkeme hangisidir?",
        options: ["Danıştay", "Yargıtay", "Sayıştay", "Anayasa Mahkemesi"],
        correctIndex: 0,
        context: law,
      }),
    ).toEqual(["Sayıştay"]);
  });

  it("ölçü kendini doğrulayamazsa susar: tanım yok, genel soru sözcüğü, virgülsüz cümle", () => {
    const options = ["TÜFE", "ÜFE", "Dezenflasyon", "Stagflasyon"];
    expect(offKindDistractors({ stem: "Hangi endeks tüketici fiyatlarını izler?", options, correctIndex: 0, context: "" })).toEqual([]);
    expect(askedKind("Bu durum hangi kavramla açıklanır?")).toBeNull();
    expect(termKind("ÜFE", "ÜFE TÜFE'den daha oynaktır.")).toBeNull();
  });

  it("test yapı denetimi kaynakla işaretler; ders yapı denetimi 'medium' yazar", () => {
    const context = "Dezenflasyon, enflasyon oranının düşmesidir. Stagflasyon, durgunluk ile yüksek enflasyonun birlikte görülmesidir.";
    const q = question("Tüketici fiyatlarını izleyen endeks hangisidir?", ["Tüketici fiyat endeksi", "Üretici fiyat endeksi", "Dezenflasyon", "Stagflasyon"], "Tüketici fiyat endeksi");
    expect(quizStructureIssues(q, { optionCount: 4, context }).some((issue) => issue.startsWith(OFF_KIND_PREFIX))).toBe(true);
    expect(quizStructureIssues(q, { optionCount: 4 }).some((issue) => issue.startsWith(OFF_KIND_PREFIX))).toBe(false);
    const lessonScreen = screen("Fiyat endeksleri", [
      text("Tüketici fiyat endeksi hanehalkının aldığı malların fiyat değişimini ölçer. Üretici fiyat endeksi üretici fiyatlarını ölçer."),
      mcqCheck("Tüketici fiyatlarını izleyen endeks hangisidir?", ["Tüketici fiyat endeksi", "Üretici fiyat endeksi", "Dezenflasyon", "Stagflasyon"], 0),
    ]);
    const issues = screenStructureIssues(lessonScreen, 1, { runningHeaders: [], pages: [{ page: 3, text: context }], optionCount: 4 });
    expect(issues.find((issue) => issue.problem.startsWith("Çeldirici sorulan türden değil"))?.severity).toBe("medium");
  });
});

/* ───────────── 3. Kartlar ───────────── */

describe("3 · kartlar: destede aynı bilgi yok, formülün harfleri ayrı kart olmaz", () => {
  const card = (front: string, back: string): TeacherCard => ({ front, back });
  // Canlıdaki yol destesi: 1, 2, 6 aynı bilgi; 3 ve 4 aynı bilgi.
  const economics = [
    card("Enflasyon nedir?", "Genel fiyat düzeyinin sürekli artması"),
    card("Genel fiyat düzeyinin sürekli artmasına ne ad verilir?", "Enflasyon"),
    card("Deflasyon nedir?", "Genel fiyat düzeyinin sürekli düşmesi"),
    card("Genel fiyat düzeyinin sürekli düşmesine ne denir?", "Deflasyon"),
    card("Dezenflasyon nedir?", "Enflasyon oranının düşmesi"),
    card("Fiyatlar genel düzeyindeki sürekli artış hangi kavramla açıklanır?", "Enflasyon"),
    card("Hiperenflasyon için kullanılan ölçüt nedir?", "Aylık enflasyonun %50'yi aşması"),
  ];

  it("ekonomi: ters çevrilmiş kart ve aynı cevaplı kart aynı bilgidir; kardeş kavramlar ayrıdır", () => {
    expect(sameCardFact(economics[0]!, economics[1]!)).toBe(true);
    expect(sameCardFact(economics[1]!, economics[5]!)).toBe(true);
    expect(sameCardFact(economics[0]!, economics[5]!)).toBe(true);
    expect(sameCardFact(economics[2]!, economics[3]!)).toBe(true);
    expect(sameCardFact(economics[0]!, economics[2]!)).toBe(false);
    expect(sameCardFact(economics[2]!, economics[4]!)).toBe(false);
    expect(sameCardFact(economics[4]!, economics[6]!)).toBe(false);
  });

  it("Araçlar: 'MV = PY'nin her harfi ayrı kart olmaz; aynı harfi soran iki kart aynı bilgidir", () => {
    const letters = [
      card("MV = PY denkleminde M neyi gösterir?", "Para arzı (para miktarı)"),
      card("MV = PY denkleminde V neyi gösterir?", "Paranın dolaşım hızı"),
      card("Miktar teorisinde M neyi ifade eder?", "Para miktarı"),
      card("MV = PY'de P neyi gösterir?", "Fiyatlar genel düzeyi"),
    ];
    expect(formulaLetterCard(letters[0]!)).toBe("MV=PY");
    expect(formulaLetterCard(card("MV = PY bağıntısı neyi anlatır?", "Para arzı ile nominal gelirin ilişkisini"))).toBeNull();
    expect(cardSetIssue(letters[1]!, [letters[0]!])).toMatch(/harfleri ayrı kartlara bölünmüş/);
    expect(cardSetIssue(letters[2]!, [letters[0]!])).toMatch(/aynı bilgi/);
    // Fizik: F = m·a da aynı kural.
    const physics = [card("F = m·a bağıntısında m neyi gösterir?", "Kütle"), card("F = m·a bağıntısında a neyi gösterir?", "İvme")];
    expect(cardSetIssue(physics[1]!, [physics[0]!])).toMatch(/F=m·a/);
  });

  it("biyoloji ve tarih: farklı bilgiler aynı sayılmaz", () => {
    expect(sameCardFact(card("Mitozun sonunda kaç hücre oluşur?", "İki özdeş hücre"), card("Mayozun sonunda kaç hücre oluşur?", "Dört hücre"))).toBe(false);
    expect(sameCardFact(card("Tanzimat Fermanı hangi yıl ilan edildi?", "1839"), card("Islahat Fermanı hangi yıl ilan edildi?", "1856"))).toBe(false);
    expect(
      sameCardFact(card("Enflasyon hedefini kim belirler?", "Merkez bankası"), card("Para politikasını kim yürütür?", "Merkez bankası")),
    ).toBe(false);
  });

  it("döngü aynı bilgiyi eksik sayar, ikinci taslak desteyi görür; ek tur birleşimi de aynı ölçüyle", async () => {
    const prompts: string[] = [];
    let call = 0;
    const second = [
      card("Durgunluk ile yüksek enflasyonun birlikte görülmesine ne denir?", "Stagflasyon"),
      card("Enflasyonun reel faize etkisi nedir?", "Reel faizi düşürür"),
      card("Talep enflasyonunun kaynağı nedir?", "Toplam talebin kapasiteyi aşması"),
    ];
    const ask = vi.fn(async (_system: string, user: string) => {
      prompts.push(user);
      return { cards: call++ === 0 ? economics : second };
    });
    const loop = await teacherCardsLoop(ask, { topicLabel: "Enflasyon", prepTitle: "Makroekonomi", pages: [{ page: 2, text: "…" }], count: 6 });
    expect(loop.cards).toHaveLength(6);
    for (let i = 0; i < loop.cards.length; i += 1) {
      for (let j = i + 1; j < loop.cards.length; j += 1) expect(sameCardFact(loop.cards[i]!, loop.cards[j]!)).toBe(false);
    }
    expect(loop.rejected.filter((row) => /aynı bilgi/.test(row.problems[0] ?? ""))).toHaveLength(3);
    expect(prompts[1]).toContain("Enflasyon nedir?");
    expect(mergeDistinctCards([economics[0]!], [economics[1]!, economics[2]!], 3)).toEqual([economics[0], economics[2]]);
    for (const route of ["src/app/api/learning/exam-prep/node/route.ts", "src/app/api/learning/flashcards/generate/route.ts"]) {
      expect(read(route)).toContain("mergeDistinctCards(");
    }
  });

  it("kural yazar ve denetçide aynı metin", () => {
    expect(cardsSystem("document")).toContain(CARD_DISTINCT_RULE);
    expect(cardsSystem("topic", "spaced")).toContain(CARD_DISTINCT_RULE);
    expect(cardsVerifySystem("document")).toContain(CARD_DISTINCT_RULE);
  });
});

/* ───────────── 4. Doğru/yanlış ───────────── */

describe("4 · doğru/yanlış: aynı terimin iki tanımı çifttir", () => {
  const tf = (textValue: string, correct: boolean, correctedStatement?: string) => ({
    text: textValue,
    correct,
    explanation: "Kaynaktaki kural bunu söyler, ayrıntısıyla.",
    ...(correctedStatement ? { correctedStatement } : {}),
    misconceptionTag: `etiket ${textValue.length}`,
  });

  it("canlı: 'Deflasyon … düşmesidir' (D) ile 'Deflasyon, enflasyon oranının düşmesidir' (Y) çifttir", () => {
    const five = tf("Deflasyon genel fiyat düzeyinin sürekli düşmesidir.", true);
    const six = tf("Deflasyon, enflasyon oranının düşmesidir.", false, "Enflasyon oranının düşmesi dezenflasyondur.");
    // Kök neden: eski ölçü bütün cümlenin anahtarlarına bakıyordu; ortak anahtar küçük kümenin yarısı (eşik %75).
    const share = (left: string, right: string) => {
      const a = factKeys(left);
      const b = factKeys(right);
      return [...a].filter((key) => b.has(key)).length / Math.min(a.size, b.size);
    };
    expect(share(five.text, six.text)).toBe(0.5);
    expect(share(five.text, six.correctedStatement!)).toBe(0.25);
    expect(share(five.text, six.text)).toBeLessThan(TF_SAME_FACT_OVERLAP);
    expect(sameDefinedSubject(five.text, six.text)).toBe(true);
    expect(sameTrueFalseFact(five, six)).toBe(true);
  });

  it("biyoloji ve hukuk: aynı öznenin iki tanımı çift; farklı alt bilgiler değil", () => {
    expect(
      sameTrueFalseFact(
        tf("Mitoz, bir hücrenin iki özdeş hücreye bölünmesidir.", true),
        tf("Mitoz, üreme hücrelerinin oluşmasıdır.", false, "Üreme hücreleri mayozla oluşur."),
      ),
    ).toBe(true);
    expect(
      sameTrueFalseFact(
        tf("Zamanaşımı, hakkın belli bir sürenin geçmesiyle dava edilememesidir.", true),
        tf("Zamanaşımı, hakkın tamamen ortadan kalkmasıdır.", false, "Zamanaşımında hak dava edilemez ama doğal borç kalır."),
      ),
    ).toBe(true);
    // Biri tanım değil (etki, sahip olma) ya da özne genel bir niteleyici: ayrı bilgi.
    expect(sameTrueFalseFact(tf("Mitokondri hücrenin enerji üretim merkezidir.", true), tf("Mitokondri kendi DNA'sına sahiptir.", true))).toBe(false);
    expect(
      sameTrueFalseFact(tf("Enflasyon, paranın satın alma gücünü azaltır.", true), tf("Enflasyon, genel fiyat düzeyinin sürekli artmasıdır.", true)),
    ).toBe(false);
    expect(sameDefinedSubject("Normal doğum, bebeğin vajinal yoldan çıkmasıdır.", "Normal nabız kalbin düzenli atmasıdır.")).toBe(false);
  });

  it("kural yazar ve denetçide aynı metin; ikinci taslak seti görür", () => {
    expect(trueFalseSystem("document")).toContain(TRUE_FALSE_PAIR_RULE);
    expect(trueFalseVerifySystem("document")).toContain(TRUE_FALSE_PAIR_RULE);
    expect(read("src/lib/learning/teacher-practice.ts")).toContain("kept.map((item) => item.text)");
  });
});

/* ───────────── 5. Testin bütünü (Araçlar testi dahil) ───────────── */

describe("5 · testin bütünü: aynı cevap, birinin cevabı öbürünün doğru şıkkında, aynı kalıp ve konu", () => {
  const economics = [
    question("Miktar teorisine göre hangisi doğrudur?", ["Para arzındaki artış fiyatlar genel düzeyini artırır", "Paranın dolaşım hızı her yıl iki katına çıkar", "Reel gelir para arzına eşittir", "Fiyatlar para arzından bağımsızdır"], "Para arzındaki artış fiyatlar genel düzeyini artırır"),
    question("Dezenflasyon hangi durumu anlatır?", ["Enflasyon oranının düşmesi", "Fiyatların sürekli düşmesi", "Durgunluk", "Hiperenflasyon"], "Enflasyon oranının düşmesi"),
    question("Miktar teorisine göre para arzı artarsa fiyatlar genel düzeyi nasıl değişir?", ["Artar", "Azalır", "Değişmez", "Önce azalır sonra artar"], "Artar"),
  ];

  it("ekonomi: S1'in doğru şıkkı S3'ün bilgisini söylüyor (Araçlar testi, kapsam dışı değil)", () => {
    expect(questionConflict(economics[0]!, economics[2]!, 1)).toMatch(/doğru şıkkında yazıyor/);
    const found = quizSetIssues(economics, { pointsAvailable: 0 });
    expect(found).toEqual([expect.objectContaining({ index: 2, code: "I" })]);
  });

  it("biyoloji: aynı doğru cevap; tarih: aynı kalıp ve aynı konu", () => {
    const same = [
      question("Hücrede oksijenli solunumun gerçekleştiği organel hangisidir?", ["Mitokondri", "Ribozom", "Golgi", "Lizozom"], "Mitokondri"),
      question("Oksijenli solunum hücrenin hangi organelinde yapılır?", ["Ribozom", "Mitokondri", "Koful", "Sentrozom"], "Mitokondri"),
    ];
    expect(questionConflict(same[0]!, same[1]!, 1)).toMatch(/aynı doğru cevap/);
    // Aynı sınıfın iki ayrı durumu aynı bilgi değildir (sınıflandırma testi).
    const scenarios = [
      question("Nikâh memuru olmadan yapılan evlilik hangi hükümsüzlük türüdür?", ["Yokluk", "Mutlak butlan", "Nispi butlan", "Bağlamazlık"], "Yokluk"),
      question("Kurucu şekli hiç bulunmayan vakıf senedi hangi hükümsüzlük türüdür?", ["Yokluk", "Mutlak butlan", "Nispi butlan", "Bağlamazlık"], "Yokluk"),
    ];
    expect(questionConflict(scenarios[0]!, scenarios[1]!, 1)).toBeNull();
    const frame = [
      question("Toplam talebin üretim kapasitesini aşması sonucu oluşan fiyat artışı hangi enflasyon türüdür?", ["Talep enflasyonu", "Maliyet enflasyonu", "Yapısal enflasyon", "Hiperenflasyon"], "Talep enflasyonu"),
      question("Talebin üretim kapasitesini aştığı bir ekonomide görülen fiyat artışı hangi enflasyon türüdür?", ["Maliyet enflasyonu", "Talep enflasyonu", "Ithal enflasyon", "Stagflasyon"], "Talep enflasyonu"),
    ];
    expect(questionConflict(frame[0]!, frame[1]!, 1)).not.toBeNull();
    // Aynı kalıp, farklı durum ve farklı cevap: serbest.
    const history = [
      question("Padişahın yetkilerini ilk kez sınırlayan belge hangisidir?", ["Sened-i İttifak", "Tanzimat Fermanı", "Islahat Fermanı", "Kanun-i Esasi"], "Sened-i İttifak"),
      question("Gayrimüslimlere geniş haklar tanıyan belge hangisidir?", ["Islahat Fermanı", "Tanzimat Fermanı", "Sened-i İttifak", "Mecelle"], "Islahat Fermanı"),
    ];
    expect(questionConflict(history[0]!, history[1]!, 1)).toBeNull();
  });

  it("Araçlar testi (kapsamsız) döngüde de çakışan soruyu eler, yerine yedek geçer", async () => {
    const spare = question("Paranın dolaşım hızı sabitken reel gelir artarsa fiyatlar ne olur?", ["Düşer", "Artar", "Değişmez", "İki katına çıkar"], "Düşer");
    const draft = { questions: [...economics, spare].map((item) => ({ ...item, correct: item.correct[0] })) };
    const { teacherQuizLoop } = await import("@/lib/learning/teacher-quiz-run");
    const loop = await teacherQuizLoop(vi.fn(async () => draft), {
      topicLabel: "Miktar teorisi",
      prepTitle: "Makroekonomi",
      pages: [{ page: 1, text: "MV = PY." }],
      count: 3,
      optionCount: 4,
    });
    expect(loop.questions.map((item) => item.text)).not.toContain(economics[2]!.text);
    expect(loop.questions).toHaveLength(3);
    expect(loop.rejected.find((item) => item.question.text === economics[2]!.text)?.problems[0]).toMatch(/^\[I\]/);
  });

  it("konu testi dışındaki testlerde de bütün teste bakılır; ikinci geçiş ve kurtarma çakışanı almaz", () => {
    const run = read("src/lib/learning/teacher-quiz-run.ts");
    expect(run).not.toContain("    if (scoped) {\n      // Bütün test");
    expect(run).toContain("appendWithoutConflicts(questions, fresh)");
    expect(run).toContain("salvageRejected(rejected, questions,");
    expect(appendWithoutConflicts([economics[0]!], [economics[2]!, economics[1]!])).toEqual([economics[0], economics[1]]);
  });

  it("kural yazar ve denetçide aynı metin", () => {
    for (const mode of ["document", "topic"] as const) {
      expect(quizSystem(mode)).toContain(TEST_SET_RULE);
      expect(quizVerifySystem(mode)).toContain(TEST_SET_RULE);
    }
  });
});

/* ───────────── 6. Yazılı deneme: kök cevabı veriyor ───────────── */

describe("6 · yazılı deneme S4: kökün çok sözcüklü öncülü doğru şıkkın özü", () => {
  // Canlıdaki soru (practice_exam_questions, sort_order 3), aynen.
  const live = question(
    "Bir ekonomide tarımsal verimsizlik sürerken fiyatlar genel düzeyi yükseliyor. Bu enflasyonun temel kaynağı hangi gelişmedir?",
    [
      "Toplam talebin üretim kapasitesinden hızlı artması",
      "Petrol fiyatlarının yükselmesi",
      "Tarımsal verimsizliğin ekonomideki yapısal sorun olarak sürmesi",
      "Ücretlerin girdi maliyetlerini artırması",
      "Tarımsal verimsizliğin azalması",
    ],
    "Tarımsal verimsizliğin ekonomideki yapısal sorun olarak sürmesi",
  );

  it("yapı kapısı soruyu yakalıyordu (tek sözcük 'ekonomideki'); asıl ele verme üç sözcüklük öncül", () => {
    const issues = quizStructureIssues(live, { optionCount: 5 });
    expect(issues.some((issue) => issue.includes("ele veren kelimeyi içeriyor ('ekonomideki')"))).toBe(true);
    expect(issues.some((issue) => issue.startsWith(STEM_ECHO_PREFIX) && issue.includes("tarımsal verimsizlik sürerken"))).toBe(true);
    expect(sameRoot("sürerken", "sürmesi")).toBe(true);
    // Genel sözcük ölçünün dayanağı değil: "ekonomideki" çıkınca da öncül yakalanır, tek sözcük denetimi susar.
    const withoutGeneric = { ...live, options: live.options.map((o, i) => (i === 2 ? "Tarımsal verimsizliğin yapısal sorun olarak sürmesi" : o)), correct: ["Tarımsal verimsizliğin yapısal sorun olarak sürmesi"] };
    const again = quizStructureIssues(withoutGeneric, { optionCount: 5 });
    expect(again.some((issue) => issue.includes("ele veren kelimeyi"))).toBe(false);
    expect(again.some((issue) => issue.startsWith(STEM_ECHO_PREFIX))).toBe(true);
  });

  it("kök neden: sayı eksikken elenen soru geri konuyordu; artık öncülü ya da cevabı kökte olan soru geri konmaz", () => {
    const problems = quizStructureIssues(live, { optionCount: 5 });
    // Eski kurtarma süzgeci yalnız iki doğru şıklı soruyu tutuyordu: bu soru ondan geçiyordu.
    expect(problems.some((problem) => /İki şık eşdeğer|Aynı şık iki kez|İki şık aynı cevap/.test(problem))).toBe(false);
    expect(problems.some((problem) => UNSALVAGEABLE_PROBLEM.test(problem))).toBe(true);
    expect(salvageRejected([{ question: live, problems }], [], { optionCount: 5 })).toEqual([]);
    // Yalnız tek sözcüklük ipucu taşıyan soru (genel sözcük) eskisi gibi geri konabilir.
    const generic = question(
      "Bir ekonomide para arzı artarsa faiz oranları ne olur?",
      ["Ekonomideki faiz oranları düşer", "Faiz oranları yükselir", "Faiz oranları değişmez", "Faiz oranları önce yükselir", "Faiz oranları dalgalanır"],
      "Ekonomideki faiz oranları düşer",
    );
    const genericProblems = quizStructureIssues(generic, { optionCount: 5 });
    expect(genericProblems.some((problem) => problem.includes("ele veren kelimeyi"))).toBe(true);
    expect(genericProblems.some((problem) => problem.startsWith(STEM_ECHO_PREFIX))).toBe(false);
    expect(salvageRejected([{ question: generic, problems: genericProblems }], [], { optionCount: 5 })).toEqual([generic]);
  });

  it("döngü (yazılı deneme kipi) soruyu eler; sayı eksik kalsa da kurtarma onu geri koymaz", async () => {
    const good = [
      question("Petrol fiyatı yükselince üretim maliyeti artan bir ekonomide görülen enflasyon hangisidir?", ["Maliyet enflasyonu", "Talep enflasyonu", "Yapısal enflasyon", "Dezenflasyon", "Deflasyon"], "Maliyet enflasyonu"),
      question("Talebin üretim kapasitesini aştığı dönemde fiyatlar neden yükselir?", ["Mal arzı talebe yetişmez", "Ücretler düşer", "Vergiler kalkar", "İthalat durur", "Faiz sıfırlanır"], "Mal arzı talebe yetişmez"),
    ];
    const draft = { questions: [live, ...good].map((item) => ({ ...item, correct: item.correct[0] })) };
    const { teacherQuizLoop } = await import("@/lib/learning/teacher-quiz-run");
    const loop = await teacherQuizLoop(vi.fn(async () => draft), {
      topicLabel: "Enflasyon türleri",
      prepTitle: "Makroekonomi",
      pages: [],
      sourceBlock: "Yapısal enflasyon tarımsal verimsizlik gibi kalıcı sorunlardan doğar.",
      count: 3,
      rephrase: true,
      optionCount: 5,
    });
    expect(loop.questions.map((item) => item.text)).not.toContain(live.text);
    const row = loop.rejected.find((item) => item.question.text === live.text);
    expect(row?.problems.some((problem) => problem.startsWith(STEM_ECHO_PREFIX))).toBe(true);
    expect(salvageRejected(loop.rejected, loop.questions, { optionCount: 5 }).map((item) => item.text)).not.toContain(live.text);
  });

  it("deneme yolu yapı kapısından geçer: mock-exam → generateExamQuiz → runTeacherQuiz → teacherQuizLoop", () => {
    expect(read("src/lib/learning/mock-exam/create.ts")).toContain("const outcome = await generateExamQuiz({");
    expect(read("src/lib/learning/exam-quiz-generate.ts")).toContain("const outcome = await runTeacherQuiz(input.service, {");
    expect(read("src/lib/learning/teacher-quiz-run.ts")).toContain("quizStructureIssues(slot.question, { multi: input.multi, optionCount, context })");
  });

  it("yanlış alarm yok: öncül yok, çeldirici de öncülü taşıyor, ortak tek sözcük (biyoloji, hukuk, ekonomi)", () => {
    expect(
      stemPhraseInAnswer(
        "Anayasa değişikliği teklifinin kabulü için gereken çoğunluk nedir?",
        "Üye tamsayısının beşte üçü",
        ["Üye tamsayısının salt çoğunluğu", "Toplantıya katılanların yarısı", "Üye tamsayısının üçte ikisi"],
      ),
    ).toBeNull();
    expect(
      stemPhraseInAnswer("Bitkilerde fotosentez sırasında ışık enerjisi hangi enerjiye dönüşür?", "Kimyasal enerji", ["Isı enerjisi", "Ses enerjisi"]),
    ).toBeNull();
    expect(
      stemPhraseInAnswer(
        "Bir ülkede ithalat ihracattan fazlaysa dış ticaret dengesi için hangisi doğrudur?",
        "İthalatın ihracattan fazla olması dış ticaret açığı yaratır",
        ["İhracatın ithalattan fazla olması dış ticaret fazlası yaratır", "Dış ticaret dengededir"],
      ),
    ).toBeNull();
    // Hukuk: kök ilkenin sözcüklerini veriyor, yalnız doğru şık onları taşıyor (çeldiriciler başka ilkeler) → yakalanır.
    expect(
      stemPhraseInAnswer(
        "Ceza hukukunda kanunsuz suç ve ceza olmaz ilkesi hangi kavramla ifade edilir?",
        "Suçta ve cezada kanunilik ilkesi",
        ["Kusur ilkesi", "Şahsilik ilkesi", "Orantılılık ilkesi"],
      ),
    ).toBe("suç ceza ilkesi");
    // Biyoloji: öncülü yeniden söyleyen doğru şık yakalanır.
    expect(
      stemPhraseInAnswer(
        "Bir hastada insülin salgısı azaldığında kan şekeri neden yükselir?",
        "İnsülin salgısının azalmasıyla hücrelerin glikoz alımı düşer",
        ["Glukagon salgısının azalması", "Karaciğerin glikojen depolaması", "Böbreklerin şekeri tutması"],
      ),
    ).toBe("insülin salgısı azaldığında");
  });

  it("kural yazar ve denetçide aynı metin", () => {
    expect(quizSystem("document", "practice", false, undefined, true)).toContain(STEM_ECHO_RULE);
    expect(quizVerifySystem("document", undefined, true)).toContain(STEM_ECHO_RULE);
    expect(quizVerifySystem("topic")).toContain(STEM_ECHO_RULE);
  });
});

/* ───────────── 7. Eşik şıkları (düello) ───────────── */

describe("7 · eşik şıkları: aynı sayı yalın ve yönlü iki şık olmaz", () => {
  it("ekonomi (canlı düello S7): 'Aylık %50' ile 'Aylık %50'nin üzeri'", () => {
    expect(thresholdTwinOptions(["Aylık %25", "Aylık %50", "Aylık %50'nin üzeri", "Yıllık %50"])).toEqual(["Aylık %50", "Aylık %50'nin üzeri"]);
    const issues = singleAnswerIntegrityIssues({
      type: "mcq",
      prompt: "Hiperenflasyonun ölçütü fiyatların hangi oranı aşmasıdır?",
      options: ["Aylık %25", "Aylık %50", "Aylık %50'nin üzeri", "Yıllık %50"],
      answerIndex: 2,
    });
    expect(issues.some((issue) => issue.startsWith(THRESHOLD_TWIN_PREFIX))).toBe(true);
    expect(issues.some((issue) => UNSALVAGEABLE_PROBLEM.test(issue))).toBe(true);
  });

  it("biyoloji ve hukuk: '12 ay' / '12 aydan sonra', 'en az 18 yaş' / '18 yaşın üzeri'; zıt yön ve simgeli eşitsizlik serbest", () => {
    expect(thresholdTwinOptions(["6 ay", "12 ay", "12 aydan sonra", "24 ay"])).toEqual(["12 ay", "12 aydan sonra"]);
    expect(thresholdTwinOptions(["En az 18 yaş", "18 yaşın üzeri", "21 yaş", "15 yaş"])).toEqual(["En az 18 yaş", "18 yaşın üzeri"]);
    expect(thresholdTwinOptions(["1 yaşından önce", "1 yaşından sonra", "6 aydan önce", "2 yaşından sonra"])).toBeNull();
    expect(thresholdTwinOptions(["x > 5", "x ≥ 5", "x < 5", "x ≤ 5"])).toBeNull();
    expect(thresholdTwinOptions(["0,12-0,20 sn", "0,30-0,40 sn", "0,02-0,05 sn", "0,50-0,60 sn"])).toBeNull();
  });

  it("kural test ve ders yazarında, denetçilerde aynı metin", () => {
    for (const mode of ["document", "topic"] as const) {
      expect(quizSystem(mode)).toContain(THRESHOLD_OPTIONS_RULE);
      expect(quizVerifySystem(mode)).toContain(THRESHOLD_OPTIONS_RULE);
    }
    expect(TEACHER_SYSTEM).toContain(THRESHOLD_OPTIONS_RULE);
    expect(verifySystem("document")).toContain(THRESHOLD_OPTIONS_RULE);
  });
});

describe("taslağın ayrıştırılması değişmedi", () => {
  it("parseTeacherQuiz soruyu olduğu gibi okur (kod metne dokunmaz)", () => {
    const parsed = parseTeacherQuiz({ questions: [{ ...question("Kök hangisidir?", ["A şık", "B şık", "C şık", "D şık"], "A şık"), correct: "A şık" }] });
    expect(parsed?.[0]?.text).toBe("Kök hangisidir?");
  });
});
