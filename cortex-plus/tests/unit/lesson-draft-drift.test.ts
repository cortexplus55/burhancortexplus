import { exampleIsComplete } from "@/lib/learning/example-completeness";
import { describe, expect, it } from "vitest";
import {
  isScaffoldHeading,
  joinSplitSuperscripts,
  lessonPublishIssues,
  publishLessonDraft,
} from "@/lib/learning/teaching-standards";
import { fluencyIssues, repairTurkishSurface } from "@/lib/learning/learner-fluency";
import { layoutBoard } from "@/lib/learning/lesson-board";

const base = {
  title: "Üslü Sayılar",
  overview:
    "Üslü sayı, aynı çarpanın tekrarını kısa yazmanın yoludur. Bu derste üslü sayıların kurallarını göreceğiz.",
  sections: [
    {
      heading: "Üslü Sayıların Tanımı",
      body: "**Üslü sayı**, tabanın kendisiyle kaç kez çarpıldığını gösterir. Örneğin 2³, 2 × 2 × 2 demektir.",
      note: { title: "**Üslü sayı**", body: "Taban kendisiyle üs kadar çarpılır; 2³ = 8 olur." },
      check: {
        type: "mcq",
        prompt: "Aşağıdakilerden hangisi 3² × 3³ işleminin sonucudur?",
        options: ["3⁵", "3⁶", "3⁹", "3¹"],
        answerIndex: 0,
        explanation: "Tabanlar aynı olduğunda çarpmada üsler toplanır; 2 + 3 = 5.",
        optionWhy: [
          "Doğru: üsler toplanır, 2 + 3 = 5.",
          "3⁶ üsleri çarpmaktan gelir; üsler çarpılmaz.",
          "3⁹ hem tabanı hem üssü karıştırmaktan gelir.",
          "3¹ üsleri çıkarmaktan gelir; o bölmenin kuralıdır.",
        ],
      },
    },
    {
      heading: "Üslü Sayılarda Bölme",
      body: "Tabanlar **aynıysa** bölme işleminde üsler çıkarılır: 5⁴ ÷ 5² = 5². Üslü sayılarda taban sıfırdan farklı olmalıdır.",
      check: {
        type: "trueFalse",
        prompt: "2³ ÷ 2⁵ = 2⁻² eşitliği doğru mudur?",
        options: ["Doğru", "Yanlış"],
        answerIndex: 0,
        explanation: "Bölmede üsler çıkarılır: 3 − 5 = −2 olduğundan eşitlik doğrudur.",
      },
    },
    {
      heading: "Üslü Sayılarla Problem Çözümü",
      body: "Üslü sayılardaki kuralları kullanarak problemlerde hızlı hesap yapılır.",
      example: {
        prompt: "2³ × 2⁴ ÷ 2² işleminin sonucu nedir?",
        steps: ["Çarpmada üsler toplanır: 3 + 4 = 7", "Bölmede üsler çıkarılır: 7 − 2 = 5", "Sonuç: 2⁵"],
        result: "32",
      },
    },
    {
      heading: "Üslü Sayılarla İlgili Yaygın Hata",
      body: "Öğrenciler çarpmada sık sık üsleri çarpar.",
      commonMistake: { claim: "2³ × 2⁴ = 2¹² olur.", correction: "Çarpmada üsler toplanır: 2³ × 2⁴ = 2⁷ olur." },
    },
    {
      heading: "Bilgi Kontrolü: Üslü Sayı İşlemleri",
      body: "Aşağıdaki işlemlerin sonuçlarını hesaplayınız: 1) 4³ × 4⁻¹ 2) 6⁰",
      check: {
        type: "mcq",
        prompt: "4⁵ × 4² işleminin sonucu nedir?",
        options: ["4⁷", "4¹⁰", "4³", "4⁷⁰"],
        answerIndex: 0,
        explanation: "Aynı tabanda çarpma işleminde üsler toplanır; 5 + 2 = 7.",
      },
    },
    {
      heading: "Üslü Sayılar Özet",
      body: "Üslü sayılarda kurallar tabanın aynı olmasına bağlıdır ve dikkat ister.",
    },
  ],
};

describe("gpt-4.1-mini taslak sapmaları", () => {
  const lesson = publishLessonDraft(base)!;

  it("bölüm içine yazılan örnek ve sık hata üste taşınır", () => {
    expect(lesson.commonMistake?.claim).toContain("2¹²");
    expect(lesson.example?.prompt).toContain("2³ × 2⁴ ÷ 2²");
  });

  it("adımlarla yazılan örnek çözüm metnine döner", () => {
    expect(lesson.example?.solution).toContain("3 + 4 = 7");
    expect(lesson.example?.solution).toContain("Sonuç: 2⁵ = 32");
  });

  it("konu adıyla başlayan ya da iki noktalı şablon başlığı düşer", () => {
    const headings = lesson.sections.map((section) => section.heading);
    expect(headings).not.toContain("Üslü Sayılar Özet");
    expect(headings).not.toContain("Üslü Sayılarla İlgili Yaygın Hata");
    expect(headings).not.toContain("Bilgi Kontrolü: Üslü Sayı İşlemleri");
    expect(isScaffoldHeading("Üslü Sayılarda Yaygın Hata: Toplama ve Çarpma Karışıklığı")).toBe(true);
    expect(isScaffoldHeading("Üslü Sayılarda Sık Yapılan Yanlış")).toBe(true);
    expect(isScaffoldHeading("Newton Yasası: Kuvvet ve İvme")).toBe(false);
    expect(isScaffoldHeading("Kalite Kontrolü")).toBe(false);
  });

  it("örneği taşıyan 'Problem Çözümü' bölümü örnek üste alınınca düşer", () => {
    expect(lesson.sections.map((section) => section.heading)).not.toContain("Üslü Sayılarla Problem Çözümü");
  });

  it("şık gerekçesi her yanlış şıkkı çürütüyorsa çoktan seçmeli kalır", () => {
    expect(lesson.sections[0].check?.type).toBe("mcq");
    expect(lesson.sections[0].check?.optionWhy).toHaveLength(4);
  });

  it("not başlığındaki yıldızlar atılır", () => {
    expect(lesson.sections[0].note?.title).toBe("Üslü sayı");
  });

  it("düşen şablon bölümünün sorusu, sorusu olmayan kavram bölümüne geçer", () => {
    const moved = publishLessonDraft({
      ...base,
      sections: [{ ...base.sections[0], check: undefined }, base.sections[1], base.sections[4]],
    })!;
    expect(moved.sections).toHaveLength(2);
    expect(moved.sections[0].check?.prompt).toContain("4⁵ × 4²");
  });
});

/*
  #166 yayına çıkınca canlıda belgesiz ders iki taslakta da "Üs bölünmüş"
  diye reddedildi; öğrenci ders alamadı. Model üssün üssünü "(3²)³ = 3²×³"
  diye yazıyor. Örnek eskiden bölümün içinde kalıp atıldığı için bu satır
  kapıya hiç gelmiyordu; üste taşınınca bütün dersi düşürdü.
*/
describe("bölünmüş üs dersi düşürmez", () => {
  it("iki üst simge arasındaki işleç üst simgeye döner", () => {
    expect(joinSplitSuperscripts("(3²)³ = 3²×³ = 3⁶")).toBe("(3²)³ = 3²ˣ³ = 3⁶");
    expect(joinSplitSuperscripts("2³+⁴ = 2⁷")).toBe("2³⁺⁴ = 2⁷");
    expect(joinSplitSuperscripts("(aᵐ)ⁿ = aᵐ×ⁿ")).toBe("(aᵐ)ⁿ = aᵐˣⁿ");
    // Üst simgeden sonra normal satır gelirse dokunulmaz.
    expect(joinSplitSuperscripts("a² + b² = c²")).toBe("a² + b² = c²");
    expect(joinSplitSuperscripts("3² × 3³ = 3⁵")).toBe("3² × 3³ = 3⁵");
  });

  it("örnekte üssün üssü olan taslak kapıdan geçer", () => {
    const published = publishLessonDraft({
      ...base,
      sections: [
        ...base.sections.slice(0, 2),
        {
          heading: "Üssün Üssü Problem Çözümü",
          body: "Üssün üssü alınırken üsler çarpılır.",
          example: {
            prompt: "(3²)³ ifadesinin değeri kaçtır?",
            solution: "(3²)³ = 3²×³ = 3⁶ = 729 bulunur.",
          },
        },
      ],
    })!;
    expect(published.example?.solution).toContain("3²ˣ³");
    expect(lessonPublishIssues(published).some((issue) => /Üs bölünmüş/.test(issue))).toBe(false);
  });
});

describe("çözümlü örnek yazımı", () => {
  const draft = {
    ...base,
    sections: base.sections.slice(0, 2),
  };

  it("'birimle' kalıbı çözümden atılır", () => {
    const lesson = publishLessonDraft({
      ...draft,
      example: {
        prompt: "3⁴ × 3⁻² işleminin sonucu kaçtır?",
        solution: "Üsler toplanır: 3⁴ × 3⁻² = 3² Sonuç: 3² = 9 birimle",
      },
    })!;
    expect(lesson.example?.solution).not.toMatch(/birimle/);
  });

  it("cümle sonu noktasıyla biten ve üslü yazılan hesap tamamdır", () => {
    expect(exampleIsComplete("2³ × 2⁴ ÷ 2² nedir?\nÇarpmada üsler toplanır: 3 + 4 = 7. Sonuç: 2⁵ = 32.")).toBe(true);
    expect(exampleIsComplete("3⁴ × 3⁻² kaçtır?\n3⁴ × 3⁻² = 3² Sonuç: 9")).toBe(true);
    // Sonuç yazılmamış yarım hesap hâlâ yarım.
    expect(exampleIsComplete("2³ × 2⁴ işlemini yap.\nÜsler toplanır: 3 + 4 ve taban aynı kalır.")).toBe(false);
  });

  it("'kendisiyli' yazım hatası düzeltilir", () => {
    expect(repairTurkishSurface("Taban kendisiyli çarpılır.")).toBe("Taban kendisiyle çarpılır.");
    expect(repairTurkishSurface("Üslerin çarpılmasıylı bulunur.")).toBe("Üslerin çarpılmasıyla bulunur.");
    // Hatanın kaynağı: izafet onarımı araç ekini yönelme sanıyordu.
    expect(repairTurkishSurface("Üslerin çarpılmasıyla bulunur.")).toBe("Üslerin çarpılmasıyla bulunur.");
    expect(repairTurkishSurface("Sonuç bu formülle hesaplanır.")).toBe("Sonuç bu formülle hesaplanır.");
  });
});

describe("çözüm tahtası etiketleri", () => {
  /*
    Canlıda tek satır gelen çözüm "Verilen: 5² / 3 şöyle hesaplanır: /
    5⁴ İstenen: …" diye bölünüyordu: virgülden ayrılan "3" yüklemsiz
    satır sanılıp önüne kalıp eklendi.
  */
  it("etiketlerden önce satır kırılır, kalıp eklenmez", () => {
    const lines = layoutBoard(
      "Verilen: 5², 3, 5⁴ İstenen: (5²)³ ÷ 5⁴ işleminin sonucu Bağıntı: (aᵐ)ⁿ = aᵐˣⁿ Yerine koyma: (5²)³ = 5⁶, sonra 5⁶ ÷ 5⁴ = 5² Sonuç: 25",
    ).map((line) => line.text);
    expect(lines[0]).toBe("Verilen: 5², 3, 5⁴");
    expect(lines.join(" | ")).not.toContain("şöyle hesaplanır");
    expect(lines.some((line) => line.startsWith("İstenen:"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Sonuç: 25"))).toBe(true);
  });
});

/*
  Kurtarma moduna hâlâ düşen 5/17 taslağın tetikleyicileri (29 Eylül,
  yerel yeniden oynatma). Düzeltmeden sonra 1/17.
*/
describe("kurtarmayı tetikleyen yanlış alarmlar", () => {

  it("sondaki parantez yüklemin yerini almaz", () => {
    expect(fluencyIssues("Her sayı sıfır üssü aldığında sonuç 1 olur (0⁰ hariç).")).not.toContain("no_predicate");
  });

  it("'Sık Karşılaşılan Hata' şablon başlığıdır", () => {
    expect(isScaffoldHeading("Üslü Sayılarda Sık Karşılaşılan Hata")).toBe(true);
  });
});
