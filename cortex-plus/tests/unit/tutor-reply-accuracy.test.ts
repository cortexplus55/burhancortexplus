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
  gradeStudentClaim,
  needsQuantModelCheck,
  parseQuantSelfCheck,
  repairQuantitative,
} from "@/lib/learning/tutor-quant";
import { chatMisconceptionRow, finalizeTutorReply, requestsAnswerOnly, splitTutorChrome } from "@/lib/learning/tutor-reply";

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
    expect(shaped.content).toMatch(/Doğru kısım/);
  });

  it("iktisat hesabındaki yanlış çarpımı düzeltir", () => {
    const reply = "On birim malın maliyeti 10 × 4 = 50 liradır.";
    const audit = auditQuantitative(reply);
    expect(audit.ok).toBe(false);
    expect(audit.issues[0]?.kind).toBe("arithmetic");
    expect(repairQuantitative(reply, audit)).toMatch(/10 × 4 = 40/);
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
    expect(shaped.content).toMatch(/\[\[kapsam:/);
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
    expect(shaped.content).not.toMatch(/0\.1/);
    expect(shaped.content).not.toMatch(/Materyal dışı/);
    const view = splitTutorChrome(shaped.content);
    expect(view.body.startsWith("**Sadece cevap: 0,1 mol.**")).toBe(true);
    expect(view.steps).toMatch(/0,1 mol/);
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
