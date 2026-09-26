import { describe, expect, it } from "vitest";
import { spendableCredits } from "@/lib/credits/spendable";
import { creditChipLabel, FOUNDER_CREDIT_LABEL } from "@/lib/credits/chip-label";
import { isContextlessFragment, isEchoOfPriorText, repairTurkishSurface } from "@/lib/learning/learner-fluency";
import {
  gradeNumericalAnswer,
  gradeSectionCheck,
  isHighOverlap,
  optionWhyUniqueIssues,
  sealLessonForPlay,
  sealSectionCheck,
} from "@/lib/learning/lesson-play";
import { runLessonQualityPipeline } from "@/lib/learning/lesson-quality-pipeline";
import { mergeTopicSources } from "@/lib/learning/source-context";
import { auditQuantitative } from "@/lib/learning/tutor-quant";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

const CHEM_SOURCE = [
  "[foto-3.jpg · s.1]: 14 g N₂ ve 4 g H₂ tepkimeye girer. N₂ + 3H₂ → 2NH₃.",
  "[pdf-16-sayfa.pdf · s.6]: Yüzde verim gerçek ürünün kuramsal ürüne oranıdır.",
].join("\n");

function check(partial: Partial<SectionCheck> & Pick<SectionCheck, "prompt" | "type">): SectionCheck {
  return {
    explanation: "Kaynak, ayrımı verilen şarta bağlar.",
    options: partial.options,
    answerIndex: partial.answerIndex,
    ...partial,
  } as SectionCheck;
}

describe("hâl eki onarımı genel kalıba çalışır", () => {
  it("kimya ve tarih örneklerinde yönelmeyi iyelik yapar", () => {
    expect(repairTurkishSurface("ürün miktara ile")).toContain("ürün miktarı ile");
    expect(repairTurkishSurface("savaş sonucuna ile")).toContain("savaş sonucu ile");
  });
});

describe("kesin hüküm ve tam denk", () => {
  it("biyolojide kaynağın 'çoğunlukla' dediği yerde yalnızca demez", () => {
    const source = "Fotosentez çoğunlukla yapraklarda olur.";
    const pipeline = runLessonQualityPipeline(
      {
        title: "Fotosentez",
        overview: "Fotosentez ışık enerjisini kimyasal enerjiye çevirir ve organeller işi böler.",
        sections: [
          {
            heading: "Yaprak",
            body: "Fotosentez yalnızca yapraklarda olur. Kloroplast ışığı yakalar.",
            check: check({
              type: "trueFalse",
              prompt: "Fotosentez yalnızca yapraklarda olur.",
              options: ["Doğru", "Yanlış"],
              answerIndex: 0,
            }),
          },
          {
            heading: "Işık",
            body: "Işık enerjisi kimyasal enerjiye dönüşür. Bu dönüşüm organelde yürür.",
            check: check({
              type: "mcq",
              prompt: "Işık enerjisi nereye dönüşür?",
              options: ["Kimyasal enerji", "Isıya", "Sesa", "Basınca"],
              answerIndex: 0,
              optionWhy: [
                "Kaynak kimyasal enerjiyi söyler.",
                "Isı bu cümlede sonuç değildir.",
                "Ses dönüşüm değildir.",
                "Basınç burada yoktur.",
              ],
            }),
          },
        ],
        summary: [
          "Fotosentez ışığı kimyasal enerjiye çevirir.",
          "Dönüşüm organelde yürür.",
          "Yaprak çoğu durumda ana yerdir.",
        ],
      },
      { sourceExcerpt: source },
    );
    expect(pipeline.issues.some((issue) => issue.rule === "unsupported_absolute")).toBe(true);
  });

  it("oranlar eşitse sınırlayıcı yok sayılır", () => {
    const text =
      "2 mol Al ve 3 mol Cl₂, 2Al + 3Cl₂ → 2AlCl₃ tepkimesinde Al sınırlayıcıdır.";
    const audit = auditQuantitative(text);
    expect(audit.issues.some((issue) => issue.kind === "limiting")).toBe(true);
    expect(audit.issues.some((issue) => /hiçbiri sınırlayıcı değil|eşit/i.test(issue.repair ?? ""))).toBe(
      true,
    );
  });
});

describe("beş kontrol ve paket sızdırmazlığı", () => {
  it("numerical 0,5 mol ile 0.5 mol eşit, birimsiz yarım puan", () => {
    expect(gradeNumericalAnswer("0,5 mol", "0.5 mol").correct).toBe(true);
    expect(gradeNumericalAnswer("0,5", "0.5 mol").half).toBe(true);
    expect(gradeNumericalAnswer("5", "0.5 mol").correct).toBe(false);
  });

  it("findError hatalı satır kimliğini pakette taşımaz", () => {
    const sealed = sealSectionCheck(
      check({
        type: "findError",
        prompt: "Bu çözümde hangi satır hatalı?",
        faultyText: "Adım 1: 2+2=4\nAdım 2: 4×3=15\nAdım 3: sonuç 15",
        options: ["Adım 1", "Adım 2", "Adım 3"],
        answerIndex: 1,
        explanation: "4×3=12 olmalı.",
      }),
    );
    expect(sealed).not.toHaveProperty("answerIndex");
    expect(JSON.stringify(sealed)).not.toMatch(/answerIndex/);
    expect(sealed.lines?.length).toBeGreaterThan(1);
  });

  it("optionWhy tekrarı reddedilir", () => {
    const issues = optionWhyUniqueIssues(
      check({
        type: "mcq",
        prompt: "Hangisi doğru?",
        options: ["A", "B", "C"],
        answerIndex: 0,
        optionWhy: [
          "Bu şık kaynağın verdiği sonucu taşır.",
          "Bu şık kaynağın verdiği sonucu taşır.",
          "Bu şık kaynağın verdiği sonucu taşır.",
        ],
      }),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it("ekonomi örneğinde yanlış indirim hesabı reddedilir", () => {
    const issues = gradeSectionCheck(
      check({
        type: "numerical",
        prompt: "120 TL ürün %25 indirimli kaç TL?",
        answer: "90 TL",
        explanation: "120 × 0,75 = 90.",
      }),
      { text: "100 TL" },
    );
    expect(issues.correct).toBe(false);
  });
});

describe("özet ve yankı", () => {
  it("Ayrıca ile başlayan özet bağlamsızdır", () => {
    expect(isContextlessFragment("Ayrıca bu kural her yerde geçerlidir.")).toBe(true);
    expect(isContextlessFragment("Diğer madde artar.")).toBe(true);
  });

  it("yankı %70 örtüşmeyi yakalar", () => {
    const prior = "Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler.";
    expect(isHighOverlap(prior, "Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler ve okur.")).toBe(
      true,
    );
    expect(isEchoOfPriorText(prior, [prior])).toBe(true);
  });
});

describe("kaynak birleştirme ve çip", () => {
  it("fotoğraf + PDF pasajları dosya etiketiyle durur", () => {
    const merged = mergeTopicSources(
      {
        block: "[foto-3.jpg · s.1]: 14 g azot ve 4 g hidrojen.",
        matches: [],
        documentName: "foto-3.jpg",
      },
      [
        {
          documentId: "pdf",
          documentName: "pdf-16-sayfa.pdf",
          chunkId: "c1",
          content: "Yüzde verim gerçek ürünün kuramsal ürüne oranıdır.",
          pageNumber: 6,
          similarity: 0.9,
          chunkIndex: 0,
        },
      ],
    );
    expect(merged.block).toMatch(/foto-3\.jpg/);
    expect(merged.block).toMatch(/pdf-16-sayfa\.pdf/);
    expect(merged.block).toMatch(/s\.6/);
  });

  it("tarih Word + PPTX etiketleri birleşir", () => {
    const merged = mergeTopicSources(
      {
        block: "[kurtulus.docx · s.2]: Doğu Cephesi 1920'de kapandı.",
        matches: [],
        documentName: "kurtulus.docx",
      },
      [
        {
          documentId: "pptx",
          documentName: "cepheler.pptx",
          chunkId: "c2",
          content: "Batı Cephesi İnönü ve Sakarya savaşlarını kapsar.",
          pageNumber: 3,
          similarity: 0.88,
          chunkIndex: 1,
        },
      ],
    );
    expect(merged.block).toMatch(/kurtulus\.docx/);
    expect(merged.block).toMatch(/cepheler\.pptx/);
  });

  it("çip satın alınan + hak toplamını ve kurucuyu gösterir", () => {
    expect(spendableCredits({ balance: 5, freeAllowanceRemaining: 3 })).toBe(8);
    expect(creditChipLabel({ planLabel: "Plus", balance: 8 })).toMatch(/Plus · 8/);
    expect(creditChipLabel({ isAdmin: true, balance: 0 })).toBe(FOUNDER_CREDIT_LABEL);
  });

  it("sızdırılmış derste cevap alanları yoktur", () => {
    const lesson: LessonV2 = {
      title: "Mol",
      overview: "Mol, tanecikleri paketler hâlinde sayar ve kütleyi o paket üzerinden okur.",
      sections: [
        {
          heading: "Mol",
          body: "Mol sayısı kütlenin mol kütlesine bölünmesiyle bulunur.",
          check: check({
            type: "mcq",
            prompt: "Mol sayısı nasıl bulunur?",
            options: ["m/M", "m×M", "M/m", "m+M"],
            answerIndex: 0,
            expectedPoints: ["bölme"],
            optionWhy: ["Doğru bağıntı.", "Çarpma yanlış.", "Ters bölme.", "Toplama yok."],
          }),
        },
      ],
      summary: ["Mol paketle sayar.", "Bağıntı m/M'dir.", "Birim uyumu şarttır."],
    };
    const sealed = sealLessonForPlay(lesson);
    const blob = JSON.stringify(sealed);
    expect(blob).not.toMatch(/"answerIndex"/);
    expect(blob).not.toMatch(/"expectedPoints"/);
    expect(blob).not.toMatch(/"optionWhy"/);
  });
});

describe("kalite hattı sırası", () => {
  it("pipeline issues üretir ve raporlar", () => {
    const result = runLessonQualityPipeline(
      {
        title: "Talep",
        overview: "Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler.",
        sections: [
          {
            heading: "Eğri",
            body: "Fiyat ve miktar birlikte okunur. Eğri sağa yatıktır.",
            check: check({
              type: "trueFalse",
              prompt: "Talep eğrisi fiyat yükseldikçe istenen miktarın azaldığını söyler.",
              options: ["Doğru", "Yanlış"],
              answerIndex: 0,
            }),
          },
        ],
        summary: [
          "Diğer madde veya maddeler ise artar.",
          "Ayrıca fiyat yükselir.",
          "Bunun yanında miktar düşer.",
        ],
      },
      { sourceExcerpt: CHEM_SOURCE },
    );
    expect(result.report.length).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.stage === "checks" || issue.stage === "summary")).toBe(
      true,
    );
  });
});
