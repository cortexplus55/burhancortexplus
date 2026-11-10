import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answerShowsWork, gradeOralAnswer, ORAL_JUDGE_RULES, visibleProbe } from "@/lib/learning/oral-exam";
import { narrowPagesToTopic, oralTopicScopeLine } from "@/lib/learning/topic-section";

/*
  10 Kasım 2026, canlı denetim: sözlü kurulumunda tek konu seçildiği hâlde sorular belgedeki öbür konulardan geldi;
  doğru sıralamayı ve bağıntıyı ilk cevabında yazan öğrenciye konu yeniden soruldu ve puan %67'de kaldı.
  Örnekler farklı derslerden.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("tek konulu sözlü: konu kilidi", () => {
  const siblings = ["Mitoz", "Mayoz", "Hücre Döngüsü"];

  it("kapsam satırı seçilen konuyu ve dışarıda kalan konuları adıyla söyler", () => {
    const line = oralTopicScopeLine("Mayoz", siblings);
    expect(line).toContain("YALNIZ «Mayoz»");
    expect(line).toContain("«Mitoz»");
    expect(line).toContain("«Hücre Döngüsü»");
    expect(line).not.toContain("«Mayoz», «");
    expect(line).toContain("onlardan soru sorma");
    // Öbür konu yoksa da kural konunun adını söyler.
    expect(oralTopicScopeLine("Mayoz", ["Mayoz"])).toContain("YALNIZ «Mayoz»");
    expect(oralTopicScopeLine("", siblings)).toBe("");
  });

  it("aynı sayfadaki öbür konuların bölümü kaynaktan çıkar", () => {
    const block = [
      "1. Mitoz",
      "Mitoz, vücut hücrelerinde görülen ve kromozom sayısını koruyan bölünmedir. Büyüme ve onarım sağlar; sonuçta iki özdeş hücre oluşur.",
      "2. Mayoz",
      "Mayoz, üreme ana hücrelerinde görülür ve kromozom sayısını yarıya indirir. Krossing over ile kalıtsal çeşitlilik artar; sonuçta dört hücre oluşur.",
      "3. Hücre Döngüsü",
      "Hücre döngüsü interfaz ve bölünme evrelerinden oluşur; interfazda DNA eşlenir ve hücre büyür, kontrol noktaları geçişi denetler.",
    ].join("\n");
    const narrowed = narrowPagesToTopic([{ page: 0, text: block }], "Mayoz", siblings);
    expect(narrowed.narrowed).toBe(true);
    expect(narrowed.pages[0]!.text).toContain("Krossing over");
    expect(narrowed.pages[0]!.text).not.toContain("onarım sağlar");
    expect(narrowed.pages[0]!.text).not.toContain("kontrol noktaları");
  });

  it("sözlü motoru tek konuda kaynağı daraltır ve kapsam satırını yazara verir; çok konulu sözlü değişmez", () => {
    const oral = read("src/lib/learning/node/oral.ts");
    expect(oral).toContain("narrowPagesToTopic([{ page: 0, text: rawBlock }], input.topicLabel, siblings)");
    expect(oral).toContain("const scopeLine = input.oralSingleTopic ? oralTopicScopeLine(input.topicLabel, siblings) : \"\";");
    expect(oral).toContain("brief: [scopeLine, input.syllabusLine?.trim() ?? \"\"].filter(Boolean).join(\"\\n\") || undefined");
    expect(read("src/lib/learning/node/generation.ts")).toContain("oralSingleTopic: kind === \"oral\" && oralAllPlan.length === 0");
  });
});

describe("sözlü: tam cevap tam puan", () => {
  const question = {
    prompt: "Üç maddeyi yoğunluklarına göre sırala ve yoğunluğun bağıntısını yaz.",
    expectedPoints: ["Demir > su > yağ sıralaması", "Yoğunluk bağıntısı d = m / V", "Yoğunluk maddenin ayırt edici özelliğidir"],
    modelAnswer: "Demir > su > yağ. d = m / V; yoğunluk ayırt edici bir özelliktir.",
  };
  const answer = "Demir>su>yağ sıralaması olur. Bağıntı d=m/V; yoğunluk maddenin ayırt edici özelliğidir.";

  it("hakemin alıntısı boşlukları farklı yazsa da nokta sayılır", () => {
    const grade = gradeOralAnswer(question, answer, "", 0, [], [
      { point: question.expectedPoints[0]!, status: "covered", quote: "Demir > su > yağ sıralaması" },
      { point: question.expectedPoints[1]!, status: "covered", quote: "d = m / V" },
      { point: question.expectedPoints[2]!, status: "covered", quote: "yoğunluk maddenin ayırt edici özelliğidir" },
    ]);
    expect(grade.ratio).toBe(1);
    expect(grade.verdict).toBe("dogru");
  });

  it("hakem bir noktayı eksik saysa da cevap bütün noktaları taşıyorsa ve çelişki yoksa tam puan", () => {
    const grade = gradeOralAnswer(question, answer, "", 0, [], [
      { point: question.expectedPoints[0]!, status: "covered", quote: "Demir>su>yağ" },
      { point: question.expectedPoints[1]!, status: "covered", quote: "d=m/V" },
      { point: question.expectedPoints[2]!, status: "missing", quote: "" },
    ]);
    expect(grade.ratio).toBe(1);
    expect(grade.missing).toEqual([]);
  });

  it("hakem çelişki işaretlediyse kod yükseltmez; cevapta olmayan alıntı sayılmaz", () => {
    const contradicted = gradeOralAnswer(
      question,
      answer,
      "",
      0,
      [],
      [
        { point: question.expectedPoints[0]!, status: "covered", quote: "Demir>su>yağ" },
        { point: question.expectedPoints[1]!, status: "covered", quote: "d=m/V" },
        { point: question.expectedPoints[2]!, status: "missing", quote: "" },
      ],
      { wrong: "Demir>su>yağ", correct: "Başka bir sıralama" },
    );
    expect(contradicted.ratio).toBeLessThan(1);

    const invented = gradeOralAnswer(
      { ...question, modelAnswer: "" },
      "Sıralamayı hatırlamıyorum ama yoğunluk kütleyle ilgilidir.",
      "",
      0,
      [],
      [
        { point: question.expectedPoints[0]!, status: "covered", quote: "Demir > su > yağ sıralaması olur" },
        { point: question.expectedPoints[1]!, status: "missing", quote: "" },
        { point: question.expectedPoints[2]!, status: "missing", quote: "" },
      ],
    );
    expect(invented.ratio).toBe(0);
  });

  it("hakem kuralı tam cevabı tam puanlamayı ve alıntıyı harfi harfine kopyalamayı söyler", () => {
    expect(ORAL_JUDGE_RULES).toContain("TAM CEVAP TAM PUAN");
    expect(ORAL_JUDGE_RULES).toContain("harfi harfine kopyala");
    // Paket H kuralı yerinde: not ilk cevaba, takipte düzeltme noktayı geri kazandırmaz.
    expect(ORAL_JUDGE_RULES).toContain("Not İLK cevaba verilir");
  });
});

describe("sözlü: iş gösteren kısa cevap yeniden sorulmaz", () => {
  it("bağıntı, sıralama ya da gerekçe taşıyan cevap iş gösterir", () => {
    expect(answerShowsWork("a > b > c")).toBe(true);
    expect(answerShowsWork("d = m / V")).toBe(true);
    expect(answerShowsWork("Artar, çünkü sıcaklık yükselir.")).toBe(true);
    expect(answerShowsWork("Artar.")).toBe(false);
  });

  it("kısa ama iş gösteren cevapta takip sorusu açılmaz; çıplak kısa cevapta açılır", () => {
    const base = { persona: "supportive" as const, alreadyProbed: false, hint: null, question: "Neden artar?" };
    expect(visibleProbe({ ...base, probeKind: "why", answer: "Artar, çünkü sıcaklık yükselir." })).toBeNull();
    expect(visibleProbe({ ...base, probeKind: "detail", answer: "a > b > c" })).toBeNull();
    expect(visibleProbe({ ...base, probeKind: "why", answer: "Artar." })?.question).toBe("Neden?");
    expect(visibleProbe({ ...base, probeKind: "detail", answer: "Artar." })?.question).toBe("Biraz açar mısın?");
  });
});
