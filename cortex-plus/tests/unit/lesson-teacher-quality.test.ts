import { fluencyIssues } from "@/lib/learning/learner-fluency";
import { describe, expect, it } from "vitest";
import { conceptCheck } from "@/lib/learning/lesson-coherence";
import { fluencyIssues as surfaceIssues, repairTurkishSurface } from "@/lib/learning/learner-fluency";
import { retryStemBroken, reviewQuestionFor } from "@/lib/learning/teacher-brain";
import { auditQuantitative, quizClaimIssues, repairQuantitative } from "@/lib/learning/tutor-quant";

const CHEM_SOURCE = [
  "[s.1] foto-3.jpg: 14 g azot ve 4 g hidrojen tepkimeye girer. N₂ + 3H₂ → 2NH₃. 14 / 28 = 0,5 mol azot ve 4 / 2 = 2 mol hidrojen vardır. Oluşan ürün 2 × 0,5 = 1 mol = 17 g olur. 14 + 4 = 17 + 1.",
  "[s.9] pdf-16.pdf: Yüzde verim, gerçek ürünün kuramsal ürüne oranıdır. Kuramsal ürün 17 g ve gerçek ürün 13,6 g ise 13,6 / 17 = 0,8 olur.",
].join("\n");

const HISTORY_SOURCE =
  "[s.2] hatt.pdf: Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi. Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.";

const BIO_SOURCE =
  "[s.1] hucre.pdf: Hücre, canlıların yapı ve işlev birimidir. Mitokondri enerji dönüşümünü yürütür. Çekirdek genetik bilgiyi taşır.";

const ECON_SOURCE =
  "[s.3] talep.pdf: Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler. Fiyat ve miktar birlikte okunur.";

describe("kesin hüküm her konuda kaynakla tutulur", () => {
  it("kimyada desteklenmeyen tekliği düşürür, kaynakla aynı her zamanı tutar", () => {
    const exclusivity = "Sınırlayıcı bileşen sadece tek bir madde olabilir.";
    const fixed = repairQuantitative(exclusivity, auditQuantitative(exclusivity, CHEM_SOURCE));
    expect(fixed).toMatch(/stokiyometrik orandaysa/);
    expect(fixed).not.toMatch(/tek bir madde/);

    const kept = "Her antlaşma her zaman yazılı olmalıdır.";
    expect(repairQuantitative(kept, auditQuantitative(kept, kept))).toBe(kept);
    expect(repairQuantitative(kept, auditQuantitative(kept, HISTORY_SOURCE))).not.toMatch(/her zaman/);
  });

  it("biyolojide tek bir hücreyi ve ekonomide yalnızca bir fiyatı ayırır", () => {
    const cell = "Canlının görünür hali tek bir hücrenin içinde bölünmüş işlere dayanır.";
    expect(auditQuantitative(cell, BIO_SOURCE).issues.filter((issue) => issue.kind === "absolute")).toEqual([]);
    const price = "Piyasa yalnızca bir fiyat olabilir.";
    const dropped = repairQuantitative(price, auditQuantitative(price, ECON_SOURCE));
    expect(dropped).not.toMatch(/yalnızca bir/);
    const stated = "Fiyat yalnızca bir denge değerine oturur ve başka fiyat kalmaz.";
    expect(auditQuantitative(stated, stated).issues.filter((issue) => issue.kind === "absolute")).toEqual([]);
  });

  it("İngilizcede always yumuşar, only one kaynakta yoksa çıkar", () => {
    const always = "Demand always falls when the price rises.";
    expect(repairQuantitative(always, auditQuantitative(always, ""))).not.toMatch(/\balways\b/i);
    expect(repairQuantitative(always, auditQuantitative(always, always))).toBe(always);
    const only = "A market has only one price.";
    expect(repairQuantitative(only, auditQuantitative(only, "Markets clear when buyers and sellers meet."))).not.toMatch(/only one/i);
    expect(auditQuantitative("This topic must be studied.").issues.filter((issue) => issue.kind === "absolute")).toEqual([]);
  });
});

describe("yankı, geri bildirim ve tekrar", () => {

  it("geri bildirimi tam cümle yapar ve kırık şablonu kapıdan geçirmez", () => {
    const concept = conceptCheck("Kabahat, kanunun karşılığında idari yaptırım öngördüğü haksızlık olarak tanımlanır.");
    expect(concept?.explanation).not.toMatch(/ters çevrilirse cümle|kurulduğu anlama uyuyor/);
    expect(concept?.explanation).toMatch(/dersteki tanımla uyumludur/);
    expect(fluencyIssues(concept?.explanation ?? "")).toEqual([]);
    const broken = "Kimyasal tepkimelerde hangi maddenin ters çevrilirse cümle, kaynağın kurduğu tanımdan kopar.";
    expect(surfaceIssues(broken)).toContain("spliced");
    const cell = "Mitokondri enerji dönüşümünü ters çevrilirse cümle, kaynağın kurduğu tanımdan kopar.";
    expect(surfaceIssues(cell)).toContain("spliced");
    const price = "The price cümlede kurulduğu anlama uyuyor; yüklem terimi başka bir büyüklüğe kaydırmıyor.";
    expect(surfaceIssues(price)).toContain("spliced");
  });

  it("tekrar sorusu yargısı doğru mudur eklemez", () => {
    expect(retryStemBroken("Talep artar yargısı doğru mudur?")).toBe(true);
    const retry = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: "Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.",
        options: ["Yanlış", "Doğru"],
        answerIndex: 1,
        explanation: "Kurul onayı vergiden önce gelir.",
      },
      "tr",
      "",
    );
    expect(retry.prompt).not.toMatch(/yargısı doğru mudur/);
    expect(retry.prompt).not.toBe("Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.");
    const english = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: "Demand falls when the price rises.",
        options: ["False", "True"],
        answerIndex: 1,
        explanation: "The curve slopes down.",
      },
      "en",
      "",
    );
    expect(english.prompt).not.toMatch(/yargısı doğru mudur/);
  });
});

describe("isim tamlaması ve özet", () => {
  it("yönelmeyi iyelik ekine çevirir, lisanslı eki ve İngilizce mastarı bırakır", () => {
    const raw = "Tepkime verimi, teorik ürün miktara ile deneyde elde edilen gerçek ürün miktara arasındaki orandır.";
    const fixed = repairTurkishSurface(raw);
    expect(fixed).toContain("ürün miktarı ile");
    expect(fixed).toContain("ürün miktarı arasındaki");
    expect(fixed).not.toMatch(/miktara/);
    expect(repairTurkishSurface("Sonuç miktara göre okunur.")).toBe("Sonuç miktara göre okunur.");
    expect(repairTurkishSurface("Hücre sayısına göre karar verilir.")).toContain("sayısına");
    expect(repairTurkishSurface("Toplantı sonra ile başladı.")).toContain("sonra");
    expect(repairTurkishSurface("Fiyat miktara ile karşılaştırılır.")).toContain("miktarı ile");
    expect(repairTurkishSurface("The amount to the total is the ratio.")).toContain("amount of the");
    expect(repairTurkishSurface("Use the amount to calculate the ratio.")).toContain("amount to calculate");
    expect(fluencyIssues(fixed)).not.toContain("typo");
  });
});

describe("quiz kapısı yeni kesin hükmü de görür", () => {
  it("kaynak susunca only one sorusunu işaretler", () => {
    const issues = quizClaimIssues(
      [
        {
          text: "A market has only one price.",
          explanation: "A market has only one price and no other price clears.",
          correct: ["True"],
        },
      ],
      "Markets clear when buyers and sellers meet.",
    );
    expect(issues.some((issue) => /kesin hüküm/.test(issue))).toBe(true);
    expect(
      quizClaimIssues(
        [{ text: "Her antlaşma her zaman yazılı olmalıdır.", explanation: "Kaynak aynı cümleyi kurar.", correct: ["Evet"] }],
        "Her antlaşma her zaman yazılı olmalıdır.",
      ).some((issue) => /kesin hüküm/.test(issue)),
    ).toBe(false);
  });
});
