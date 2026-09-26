import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatSourceSections } from "@/lib/ai/source-sections";
import {
  coverageDecision,
  matchExcludedTopic,
  readSyllabusScope,
} from "@/lib/learning/prep-corpus";
import {
  auditQuantitative,
  dropUnverifiedExample,
  evaluateArithmetic,
  gradeStudentClaim,
  needsQuantModelCheck,
  parseQuantSelfCheck,
  repairQuantitative,
  quizClaimIssues,
  settleQuantReply,
} from "@/lib/learning/tutor-quant";
import { chatMisconceptionRow, finalizeTutorReply, fixTurkishQuestionOrder, requestsAnswerOnly, splitTutorChrome } from "@/lib/learning/tutor-reply";
import { repairTurkishSurface } from "@/lib/learning/learner-fluency";

const SYLLABUS = {
  documentName: "Sınav programı.docx",
  pageNumber: 2,
  text: "Katlı oranlar kanunu sınav kapsamı dışındadır. Ders notlarında yer almasına rağmen bu konudan soru sorulmayacaktır. Stokiyometri ağırlıklı konudur.",
};

describe("sayısal doğrulama", () => {
  it("A + 2B örneğinde A'yı sınırlayıcı sanan cümleyi yakalar", () => {
    const reply = "A + 2B → C. Elimizde 1 mol A ve 1 mol B varsa, A sınırlayıcıdır çünkü B'nin iki katı gerekir.";
    const audit = auditQuantitative(reply);
    expect(audit.ok).toBe(false);
    expect(audit.issues[0]?.kind).toBe("limiting");
    const fixed = repairQuantitative(reply, audit);
    expect(fixed.toLocaleLowerCase("tr")).not.toMatch(/a sınırlayıcı/);
    expect(fixed).toMatch(/sınırlayıcı B/);
    expect(needsQuantModelCheck(fixed, auditQuantitative(fixed))).toBe(false);
  });

  it("eşit oranda hükmü yanlış yazar, kısmen doğru demez", () => {
    const student = "4 g H2 ve 32 g O2 ile su oluşuyor. H2 2 mol, O2 1 mol, o zaman O2 sınırlayıcı çünkü az.";
    const grade = gradeStudentClaim({
      student,
      context: "Tepkime 2H2 + O2 → 2H2O.",
    });
    expect(grade?.verdict).toBe("yanlis");
    expect(grade?.verdictLine.toLocaleLowerCase("tr")).toMatch(/hiçbiri sınırlayıcı değil/);
    expect(grade?.verdictLine.toLocaleLowerCase("tr")).not.toMatch(/kısmen/);
    expect(grade?.rightParts.join(" ")).toMatch(/mol/i);
    expect(grade?.conclusion.toLocaleLowerCase("tr")).toMatch(/tüken/);
    const shaped = finalizeTutorReply({
      message: student,
      draft: "Bu kısmen doğru, ama henüz tam olarak doğru değil. Tekrar oranla.",
      decision: "in",
      scope: { excluded: [], weighted: [] },
      grade,
    });
    expect(shaped.content.toLocaleLowerCase("tr")).not.toMatch(/kısmen doğru/);
    expect(shaped.content.toLocaleLowerCase("tr")).toMatch(/hiçbiri sınırlayıcı değil/);
    expect(shaped.content).toMatch(/\[\[hukum:yanlis\|Tekrar bakalım\]\]/);
    expect(shaped.content).not.toMatch(/Doğru kısım:/);
    expect(shaped.content).not.toMatch(/Yanlış kısım:/);
    expect(shaped.content).not.toMatch(/Hüküm:/);
  });

  it("iktisat hesabındaki yanlış çarpımı düzeltir", () => {
    const reply = "On birim malın maliyeti 10 × 4 = 50 liradır.";
    const audit = auditQuantitative(reply);
    expect(audit.ok).toBe(false);
    expect(audit.issues[0]?.kind).toBe("arithmetic");
    expect(repairQuantitative(reply, audit)).toMatch(/10 × 4 = 40/);
  });

  it("10 üzeri çarpımı ve birimli kütle hesabını denetler", () => {
    const wrong = "N = 0,25 × 6,02 × 10²³ = 9 × 10²³.";
    const audit = auditQuantitative(wrong);
    expect(audit.ok).toBe(false);
    expect(audit.issues[0]?.kind).toBe("arithmetic");
    expect(repairQuantitative(wrong, audit)).toMatch(/1,505 × 10²³/);
    expect(auditQuantitative("N = 0,25 × 6,02 × 10²³ = 1,505 × 10²³.").ok).toBe(true);
    expect(auditQuantitative("m = 0,25 × 98 = 24,5 g.").ok).toBe(true);
    const mass = auditQuantitative("m = 0,25 mol × 98 g/mol = 25 g.");
    expect(mass.ok).toBe(false);
    expect(repairQuantitative("m = 0,25 mol × 98 g/mol = 25 g.", mass)).toMatch(/24,5 g/);
  });

  it("gram cinsinden ağırlığı kütle diye düzeltir, sınav ağırlığını ve newtonu bırakır", () => {
    const line = "Mol kütlesi sadece 1 mol maddenin gram cinsinden ağırlığıdır, tanecik sayısını içermez.";
    const audit = auditQuantitative(line);
    expect(audit.issues.some((issue) => issue.kind === "wording")).toBe(true);
    const fixed = repairQuantitative(line, audit);
    expect(fixed).toContain("kütlesidir");
    expect(fixed).toContain("tanecik sayısını içermez");
    expect(fixed).not.toMatch(/ağırlığ/);
    expect(auditQuantitative("Sınavda ağırlıklı konu stokiyometridir.").issues).toEqual([]);
    const weight = "Kütle kilogram, ağırlık newton cinsindendir.";
    expect(repairQuantitative(weight, auditQuantitative(weight))).toBe(weight);
    const distinct = "Kütle ile ağırlık aynı değildir.";
    expect(repairQuantitative(distinct, auditQuantitative(distinct))).toBe(distinct);
  });

  it("tarih kaynağındaki yılı yanıtla çelişince işaretler", () => {
    const source = "İstanbul'un fethi 1453 yılında tamamlandı.";
    const reply = "İstanbul 1452'de fethedildi.";
    const audit = auditQuantitative(reply, source);
    expect(audit.ok).toBe(false);
    expect(audit.issues[0]?.kind).toBe("date");
    expect(audit.issues[0]?.repair).toMatch(/1453/);
  });

  it("küçük model uyuşmazlığında örneği düşürür", () => {
    expect(parseQuantSelfCheck('{"ok":false,"note":"oran ters"}')?.ok).toBe(false);
    const dropped = dropUnverifiedExample("Giriş.\n\nA + 2B → C ve A sınırlayıcıdır.\n\nSoru: sence?");
    expect(dropped).not.toMatch(/→/);
    expect(dropped).toMatch(/Soru/);
  });
});

describe("hazırlık korpusu", () => {
  const docs = [
    { text: "İdeal gaz yasası PV = nRT. Basınç ve hacim." },
    { text: "Sınırlayıcı bileşen, mol sayısının katsayıya bölümüdür. Mol hesabı n = m / M." },
  ];

  it("çok belgede geçen konuyu materyal dışı saymaz", () => {
    expect(coverageDecision("Sınırlayıcı bileşeni anlamadım, bana öğretir misin?", docs, 0)).toBe("in");
    expect(coverageDecision("Mol hesabı nasıl yapılır?", docs, 0)).toBe("in");
  });

  it("hiç geçmeyen konuyu dışarı sayar, belge yoksa etiket basmaz", () => {
    expect(coverageDecision("Carnot çevriminin verimi neden 1 olamaz?", docs, 0)).toBe("out");
    expect(coverageDecision("Kuantum dolanıklığı nedir?", [], 0)).toBe("unknown");
    expect(coverageDecision("10 g CaCO3 kaç mol?", docs, 2)).toBe("in");
  });

  it("sınav programındaki kapsam dışı cümleyi ve ağırlıklı konuyu okur", () => {
    const syllabusOnly = readSyllabusScope([SYLLABUS]);
    const scope = readSyllabusScope([SYLLABUS, {
      documentName: "not.json",
      text: "",
      analysis: {
        excludedTopics: ["Optik"],
        weights: [{ topic: "Mekanik", weight: 40 }],
      },
    }]);
    const hit = matchExcludedTopic("Katlı oranlar kanununu da anlatır mısın?", syllabusOnly);
    expect(hit?.quote).toMatch(/sınav kapsamı dışındadır/);
    expect(hit?.documentName).toBe("Sınav programı.docx");
    expect(syllabusOnly.weighted.some((item) => /stokiyometri/i.test(item.topic))).toBe(true);
    expect(scope.weighted[0]?.topic).toBe("Mekanik");
    expect(scope.excluded.some((item) => item.topic === "Optik")).toBe(true);
    const shaped = finalizeTutorReply({
      message: "Katlı oranlar kanununu da anlatır mısın?",
      draft: "Bu, belgede yok.\n\nMateryal dışı: Dalton bir kural söyledi ve uzun uzun anlattı.",
      decision: "in",
      scope: syllabusOnly,
      grade: null,
    });
    expect(shaped.content.toLocaleLowerCase("tr")).toMatch(/sınav kapsamı dışındadır/);
    expect(shaped.content).toMatch(/Katlı oranlar kanunu sınav kapsamı dışındadır/);
    expect(shaped.content).not.toMatch(/Materyal dışı/);
    expect(shaped.content).not.toMatch(/####/);
    expect(shaped.content).toMatch(/Stokiyometri/);
    expect(shaped.content).toMatch(/\[\[alinti:/);
    expect(shaped.content).not.toMatch(/^>/m);
    expect(shaped.content).not.toMatch(/\[\[kapsam:/);
    const view = splitTutorChrome(shaped.content);
    expect(view.quote?.text).toMatch(/sınav kapsamı dışındadır/);
    expect(view.quote?.source).toBe("Sınav programı.docx");
    expect(view.body).toContain("[[QUOTE]]");
    expect(view.chips.map((chip) => chip.label)).toEqual([
      "Yine de detaylı anlat",
      "Sınav konusuna dön (Stokiyometri)",
    ]);
  });

  it("kapsam dışı yanıtı alıntı ve iki cümleyle keser", () => {
    const shaped = finalizeTutorReply({
      message: "Katlı oranlar kanununu da anlatır mısın?",
      draft: [
        "Bu konu sınav kapsamı dışındadır.",
        "> • Katlı oranlar kanunu sınav kapsamı dışındadır.> — ders-konulari.docx",
        "Katlı oranlar kanunu, iki elementin birden fazla bileşik oluşturduğu durumlarda kütle oranlarının sabit tam sayılarla ifade edilebileceğini belirtir. Bu kısa özet yeter.",
        "**Günlük Hayatla Benzerlik**",
        "Farklı bileşiklerin oluşumunu düşünün. Bu paragraf derste kalmamalı.",
        "**Tam Sayı Oranı**",
        "CO ve CO2 örneği burada uzar ve sınav sohbetine taşınmamalı.",
      ].join("\n\n"),
      decision: "in",
      scope: readSyllabusScope([SYLLABUS]),
      grade: null,
    });
    expect(shaped.content).not.toMatch(/^>/m);
    expect(shaped.content).not.toMatch(/Tam Sayı Oranı/);
    expect(shaped.content).not.toMatch(/CO ve CO2/);
    expect(shaped.content).toMatch(/\[\[alinti:Katlı oranlar kanunu sınav kapsamı dışındadır/);
    expect(shaped.content.split(/\n{2,}/).length).toBeLessThanOrEqual(6);
  });
});

describe("sadece cevap ve rozet", () => {
  it("ilk satırı kalın cevap yapar, adımı katlar, virgül kullanır", () => {
    expect(requestsAnswerOnly("Bana sadece cevabı söyle: 10 g CaCO3 kaç mol?")).toBe(true);
    const shaped = finalizeTutorReply({
      message: "Bana sadece cevabı söyle: 10 g CaCO3 kaç mol?",
      draft: "Bu, belgede yok.\n\nMateryal dışı: 10 g / 100 g/mol = 0.1 mol. Ayrıntılı türetme burada.",
      decision: "in",
      scope: { excluded: [], weighted: [{ topic: "Mol kavramı", documentName: "Not.pdf", note: "çekirdek", weight: null }] },
      grade: null,
    });
    expect(shaped.content.startsWith("**Sadece cevap: 0,1 mol.**")).toBe(true);
    expect(shaped.content).toContain("[[adimlar]]");
    expect(shaped.content).toContain("[[takip:");
    expect(shaped.content).not.toMatch(/0\.1/);
    expect(shaped.content).not.toMatch(/Materyal dışı/);
    const view = splitTutorChrome(shaped.content);
    expect(view.body.startsWith("**Sadece cevap: 0,1 mol.**")).toBe(true);
    expect(view.steps).toMatch(/0,1 mol/);
    expect(view.followUp).toMatch(/aynı tipte bir soru/i);
    expect(view.chips.map((chip) => chip.label)).toEqual([
      "Adım adım göster",
      "Benzer bir soru ver",
      "Ağırlıklı konuya geç",
    ]);
  });

  it("yapışık #### başlığını rozete çevirir", () => {
    const formatted = formatSourceSections("Bu, belgede yok.#### Materyal dışı\n\nKısa not.");
    expect(formatted).not.toMatch(/####\s*Materyal/);
    expect(formatted).toContain("[[rozet:Materyal dışı]]");
    const view = splitTutorChrome(formatted);
    expect(view.badge).toBe("Materyal dışı");
    expect(view.body).not.toMatch(/####/);
    expect(view.body).toMatch(/Bu, belgede yok/);
  });
});

const LIVE_STUDENT = "4 g H2 ve 32 g O2 ile su oluşuyor. H2 2 mol, O2 1 mol, o zaman O2 sınırlayıcı çünkü az.";

const LIVE_PREP = [
  "Örnek tepkime: A + 2B → C. Elimizde 1 mol A ve 1 mol B vardır.",
  "Su oluşumu H₂ + ½ O₂ → H₂O şeklinde yazılır.",
  "Aynı denklem iki kat yazılırsa 2H₂ + O₂ → 2H₂O olur.",
].join("\n");

const LIVE_DRAFT = [
  "Kısmen doğru. H₂'nin mol sayısını doğru hesapladın. Ancak O₂ için yaptığın hesaplamada bir hata var.",
  "O₂ miktarını mol olarak hesaplamak için O₂'nin mol kütlesini bilmelisin. O₂'nin mol kütlesi 32 g/mol.",
  "**H₂ için hesaplama:**",
  "- 4 g H₂ → n(H₂) = 4 / 2 = 2 mol",
  "**O₂ için hesaplama:**",
  "- 32 g O₂ → n(O₂) = 32 / 32 = 1 mol",
  "Şimdi tepkime denklemi H₂ + ½ O₂ → H₂O'dur.",
  "**Katsayılar:**",
  "- H₂, 2 mol ile 2'nin katsayısına sahiptir.",
  "- O₂, 1 mol ile ½'ün katsayısına sahiptir.",
  "H₂; 2 mol H₂, 1 mol O₂ tüketir. Yani 2 mol H₂ için 1 mol O₂ gerekirken, burada O₂'nin miktarı yetersizdir.",
  "Bu nedenle, O₂ sınırlayıcı bileşendir. H₂ yeterlidir ve O₂ tamamlandığında tepkime sona erecektir.",
  "- H₂ = 2 mol (katsayı 2)",
  "- O₂ = 1 mol (katsayı 1)",
].join("\n");

describe("canlı yol — hüküm taslağı ezer", () => {
  it("su örneğinde ilk denklem alakasız olsa da O2'yi sınırlayıcı ilan etmez", () => {
    const grade = gradeStudentClaim({ student: LIVE_STUDENT, context: LIVE_PREP });
    expect(grade?.verdict).toBe("yanlis");
    expect(grade?.verdictLine.toLocaleLowerCase("tr")).toMatch(/hiçbiri sınırlayıcı değil/);
    expect(grade?.rightParts.join(" ")).toMatch(/1 mol O/);

    const settled = settleQuantReply({ student: LIVE_STUDENT, context: LIVE_PREP, draft: LIVE_DRAFT });
    expect(settled.replaced).toBe(true);
    expect(settled.grade?.verdict).toBe("yanlis");
    const shaped = finalizeTutorReply({
      message: LIVE_STUDENT,
      draft: settled.text,
      decision: "in",
      scope: { excluded: [], weighted: [] },
      grade: settled.grade,
    });
    const folded = shaped.content.toLocaleLowerCase("tr");
    expect(folded).not.toMatch(/kısmen doğru/);
    expect(folded).not.toMatch(/hata var/);
    expect(folded).not.toMatch(/o₂ sınırlayıcı bileşen|o2 sınırlayıcı bileşen/);
    expect(folded).toMatch(/hiçbiri sınırlayıcı değil/);
    expect(folded).not.toMatch(/doğru kısım:/);
    expect(folded).not.toMatch(/yanlış kısım:/);
    expect(shaped.content).toMatch(/\[\[hukum:/);
    expect(shaped.content.toLocaleLowerCase("tr")).toMatch(/oranlar eşit|hiçbiri sınırlayıcı değil/);
    expect(shaped.content).not.toMatch(/H₂ yeterlidir|yetersizdir/);

    const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
    expect(route).toContain("settleQuantReply");
    const settleAt = route.indexOf("settleQuantReply");
    const finalizeAt = route.indexOf("finalizeTutorReply");
    expect(settleAt).toBeGreaterThan(-1);
    expect(settleAt).toBeLessThan(finalizeAt);
  });

  it("doğru çıkan eşitliğe hata diyen iktisat taslağını kısa doğruya çevirir", () => {
    const student = "Dört kalem, tanesi 5 lira: 4 × 5 = 20.";
    const draft = "Hesabında bir hata var. 4 × 5 = 20. Bu nedenle toplam 25 liradır.";
    const settled = settleQuantReply({ student, context: "Fiyat listesi 2024 yılında güncellendi.", draft });
    expect(settled.replaced).toBe(true);
    expect(settled.grade?.verdict).toBe("dogru");
    expect(settled.text).toMatch(/4 × 5 = 20/);
    expect(settled.text.toLocaleLowerCase("tr")).toMatch(/tam isabet/);
    expect(settled.text).not.toMatch(/25/);
    expect(settled.text.toLocaleLowerCase("tr")).not.toMatch(/hata var/);
  });

  it("kısmen doğru hükmü sıcak dil kullanır, etiket yığını yazmaz", () => {
    const student = "2H2 + O2 → 2H2O. 1 mol H2 ve 2 mol O2 var. H2 sınırlayıcı çünkü daha az gram.";
    const grade = gradeStudentClaim({ student });
    expect(grade?.verdict).toBe("kismen");
    const shaped = finalizeTutorReply({
      message: student,
      draft: "Kısmen doğru.",
      decision: "in",
      scope: { excluded: [], weighted: [] },
      grade,
    });
    expect(shaped.content).toMatch(/\[\[hukum:kismen\|Neredeyse\]\]/);
    expect(shaped.content.toLocaleLowerCase("tr")).toMatch(/neredeyse/);
    expect(shaped.content).not.toMatch(/Doğru kısım:/);
    expect(shaped.content).not.toMatch(/Yanlış kısım:/);
    expect(shaped.content).not.toMatch(/Hüküm:/);
    expect(shaped.content.toLocaleLowerCase("tr")).toMatch(/gram/);
    expect(shaped.content.toLocaleLowerCase("tr")).toMatch(/sınırlayıcı h/);
  });

  it("orantılı iki su denklemi doğru taslağı silmez", () => {
    const draft = "Yanlış: hiçbiri sınırlayıcı değil; ikisi de tamamen tükenir. H₂ + ½ O₂ → H₂O ile 2H₂ + O₂ → 2H₂O aynı orandır.";
    const settled = settleQuantReply({ student: LIVE_STUDENT, context: LIVE_PREP, draft });
    expect(settled.replaced).toBe(false);
    expect(settled.text).toBe(draft);
  });

  it("iki taraflı yanlış kütle eşitliğini 18 ve 35 diye ayırır", () => {
    // #112 sağ tarafı tek sayı sanıyordu: `= 17 g` hesapla 18'e çekiliyor,
    // `+ 18 g uyuyor` duruyor, 18 ile 35 hiç karşılaştırılmıyordu.
    const line = "Kütlenin korunumu kontrolü: 14 g + 4 g = 17 g + 18 g uyuyor.";
    const audit = auditQuantitative(line);
    expect(audit.ok).toBe(false);
    expect(audit.issues.some((issue) => issue.kind === "arithmetic")).toBe(true);
    const fixed = repairQuantitative(line, audit);
    expect(fixed).toContain("toplamı 18 g");
    expect(fixed).toContain("toplamı 35 g");
    expect(fixed).toMatch(/eşit değil/);
    expect(fixed).not.toMatch(/uyuyor/);
    expect(fixed).not.toMatch(/=\s*18 g/);
    expect(auditQuantitative("0,80 × 17 = 13,6 g NH₃.").ok).toBe(true);
    expect(auditQuantitative("3 × 0,5 = 1,5 mol.").ok).toBe(true);
    expect(auditQuantitative("1 mol × 17 g/mol = 17 g.").ok).toBe(true);
    expect(auditQuantitative("80% = 0,8.").ok).toBe(true);
    expect(auditQuantitative("50% = 40%.").ok).toBe(false);
    expect(auditQuantitative("0 °C = 273 K.").ok).toBe(true);
    expect(auditQuantitative("25 °C = 298 K.").ok).toBe(true);
    expect(repairQuantitative("100 °C = 273 K.", auditQuantitative("100 °C = 273 K."))).toMatch(/373,15 K/);
    expect(auditQuantitative("1 mol = 22,4 L.").ok).toBe(true);
    expect(auditQuantitative("100 kPa = 200 kPa.").ok).toBe(false);
    expect(evaluateArithmetic("(12 + 2) × 16")).toBe(224);
    expect(evaluateArithmetic("12 + 2 × 16")).toBe(44);
    const parenthesized = repairQuantitative(
      "12 + (2 × 16) = 50 g/mol.",
      auditQuantitative("12 + (2 × 16) = 50 g/mol."),
    );
    expect(parenthesized).toMatch(/44/);
    expect(parenthesized).not.toMatch(/=\s*50/);
  });

  it("sınırlayıcıyı tek madde diye kilitleyen hükmü ve kaynaksız kesinliği düzeltir", () => {
    const onlyOne = "Hayır, sınırlayıcı bileşen tepkimede tamamen tükenen tek bir maddedir.";
    const several = "Birden fazla maddeyi sınırlayıcı zannetmek yanlış sonuç verir.";
    for (const line of [onlyOne, several]) {
      const fixed = repairQuantitative(line, auditQuantitative(line));
      expect(fixed).toMatch(/stokiyometrik orandaysa/);
      expect(fixed).not.toMatch(/tek bir madde|yanlış sonuç verir/);
    }
    const definition = "Sınırlayıcı bileşen, tepkimede tamamen tükenen ve ürün miktarını belirleyen maddedir. N₂ + 3H₂ → 2NH₃. 0,5 mol N₂ ve 2 mol H₂ var. N₂ sınırlayıcıdır.";
    expect(auditQuantitative(definition).issues.filter((issue) => issue.kind === "limiting")).toEqual([]);
    const heat = "Isı her zaman sıcaklığa eşittir.";
    expect(auditQuantitative(heat).issues.some((issue) => issue.kind === "identity")).toBe(true);
    expect(repairQuantitative(heat, auditQuantitative(heat))).toMatch(/aynı büyüklük değildir/);
    const cases = [
      ["Her devrim her zaman başarılı olur.", "Her devrim her zaman başarılı olur."],
      ["Her sözleşme her zaman yazılı olmalıdır.", "Her sözleşme her zaman yazılı olmalıdır."],
      ["Her mutasyon her zaman zararlıdır.", "Her mutasyon her zaman zararlıdır."],
    ] as const;
    for (const [line, source] of cases) {
      expect(repairQuantitative(line, auditQuantitative(line, ""))).not.toMatch(/her zaman/);
      expect(repairQuantitative(line, auditQuantitative(line, source))).toBe(line);
    }
    expect(auditQuantitative("Sınavda bu konu mutlaka bilinmelidir.").issues.filter((issue) => issue.kind === "absolute")).toEqual([]);
  });

  it("yazım ve yarım sınav cümlesini dersle ortak kapıdan düzeltir", () => {
    const raw = "Sınırlayıcı bileşen tepkimde belirlenir. Ürün miktarını belirleyiz. Mol sayısı / katsayı oranı küçüğüne bakılır. Sınavda bu konu ağırlıklı.";
    const fixed = repairTurkishSurface(raw);
    expect(fixed).toContain("tepkimede");
    expect(fixed).not.toMatch(/tepkimde\b/);
    expect(fixed).toContain("belirleriz");
    expect(fixed).toContain("oranın en küçüğüne");
    expect(fixed).toContain("konu ağırlıklıdır");
    expect(repairTurkishSurface("bu konu sınavda ağırlıklı")).toBe("bu konu sınavda ağırlıklı");
    expect(repairTurkishSurface("ağırlıklı konu")).toBe("ağırlıklı konu");
    expect(repairTurkishSurface("Herşey birşey değildir.")).toBe("Her şey bir şey değildir.");
  });

  it("quiz sınırlayıcı tekliğini kaynaksız da yakalar, her zamanı ancak kaynakla yakalar", () => {
    const uniqueness = quizClaimIssues([
      {
        text: "Sınırlayıcı bileşen tepkimede tamamen tükenen tek bir maddedir.",
        correct: ["Yalnızca biri tükenir"],
        explanation: "Sınırlayıcı bileşen tepkimede tamamen tükenen tek bir maddedir. Birlikte tükenirler seçeneği yanlıştır.",
      },
    ]);
    expect(uniqueness.some((issue) => /tek madde/.test(issue))).toBe(true);
    const mutation = {
      text: "Her mutasyon her zaman zararlıdır yargısı doğru mudur?",
      explanation: "Kaynak böyle bir kesinlik kurmaz ve evet seçeneği bu yüzden yanlıştır.",
      correct: ["Hayır"],
    };
    expect(quizClaimIssues([mutation]).some((issue) => /kesin hüküm/.test(issue))).toBe(false);
    expect(
      quizClaimIssues([mutation], "Mutasyonlar DNA dizisindeki değişimlerdir.").some((issue) =>
        /kesin hüküm/.test(issue),
      ),
    ).toBe(true);
  });
});

describe("türkçe soru eki", () => {
  it("kişi ekini soru ekinden sonraya alır", () => {
    expect(fixTurkishQuestionOrder("Bir örnek üzerinden geçebiliriz mi?")).toBe("Bir örnek üzerinden geçebilir miyiz?");
    expect(fixTurkishQuestionOrder("analiz mi bu?")).toBe("analiz mi bu?");
    const shaped = finalizeTutorReply({
      message: "Biraz daha anlatır mısın?",
      draft: "Tabii. Bir örnek üzerinden geçebiliriz mi?",
      decision: "in",
      scope: { excluded: [], weighted: [] },
      grade: null,
    });
    expect(shaped.content).toContain("geçebilir miyiz?");
    expect(shaped.content).not.toContain("geçebiliriz mi");
  });
});

describe("yanılgı kaydı", () => {
  it("gram kıyasını sohbet kaynağıyla zayıf nokta satırına yazar", () => {
    const grade = gradeStudentClaim({
      student: "Hangisi daha az gramsa o sınırlayıcıdır.",
    });
    expect(grade?.verdict).toBe("yanlis");
    expect(grade?.wrongType).toBe("gram_karsilastirma");
    const row = chatMisconceptionRow(grade!, "Hangisi daha az gramsa o sınırlayıcıdır.");
    expect(row.source_kind).toBe("chat");
    expect(row.wrong_type).toBe("gram_karsilastirma");
    expect(row.corrected.toLocaleLowerCase("tr")).toMatch(/katsayı/);
    const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
    expect(route).toContain("loadPrepChatGrounding");
    expect(route).toContain("recordChatMisconception");
    expect(route).toContain("needsQuantModelCheck");
  });
});
