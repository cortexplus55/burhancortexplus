import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareChatSolution } from "@/lib/ai/chat-solve-check";
import { verifyAndFixTurkishMathExpressions } from "@/lib/learning/turkish-math-fix";
import { auditQuantitative } from "@/lib/learning/tutor-quant";
import { stepArithmeticCheck, stepArithmeticIssues } from "@/lib/solve/step-arithmetic";

/*
  Güven paketi (10 Kasım 2026), Görev 6: Türkçe aritmetik sağlama düzelticisi.
  Örnekler nötr sayılarla ve farklı derslerden (alışveriş, yol, kimya, geometri); üretim kodunda örnek yoktur.
*/

const fix = (text: string) => verifyAndFixTurkishMathExpressions(text);

describe("ayırıcı karışıklığı düzeltilir", () => {
  it("binlik nokta ondalık sanılmış sonuç doğru değerle ve binlik noktayla yazılır", () => {
    const out = fix("Üç defter alınırsa 1.200 × 3 = 3,6 lira ödenir.");
    expect(out.text).toBe("Üç defter alınırsa 1.200 × 3 = 3.600 lira ödenir.");
    expect(out.fixes).toBe(1);
  });

  it("sonuç bin kat büyük yazılmışsa küçültülür; ondalık virgül korunur", () => {
    expect(fix("Karışımda 2,5 × 4 = 10.000 gram tuz vardır.").text).toBe("Karışımda 2,5 × 4 = 10 gram tuz vardır.");
    expect(fix("Hız 0,6 ÷ 4 = 150 olur.").text).toBe("Hız 0,6 ÷ 4 = 0,15 olur.");
  });

  it("her işlem işareti ve LaTeX yazımı tanınır", () => {
    expect(fix("7.500 · 2 = 15").text).toBe("7.500 · 2 = 15.000");
    expect(fix("7.500 * 2 = 15").text).toBe("7.500 * 2 = 15.000");
    expect(fix("9.000 / 3 = 3").text).toBe("9.000 / 3 = 3.000");
    expect(fix("9.000 ÷ 3 = 3").text).toBe("9.000 ÷ 3 = 3.000");
    expect(fix("$4.200 \\times 5 = 21$").text).toBe("$4.200 \\times 5 = 21.000$");
    expect(fix("$4.200 \\cdot 5 = 21$").text).toBe("$4.200 \\cdot 5 = 21.000$");
    expect(fix("$8.400 \\div 4 = 2,1$").text).toBe("$8.400 \\div 4 = 2.100$");
  });

  it("aynı birimi taşıyan eşitlikte birim yerinde kalır", () => {
    expect(fix("Toplam: 1.250 TL × 4 = 5 TL eder.").text).toBe("Toplam: 1.250 TL × 4 = 5.000 TL eder.");
    expect(fix("**2.400 m × 3 = 7,2 m**").text).toBe("**2.400 m × 3 = 7.200 m**");
  });

  it("metin binlik nokta kullanmıyorsa sonuç da noktasız yazılır; yuvarlama korunur", () => {
    expect(fix("Alan 0,5 × 6000 = 3 birimkare.").text).toBe("Alan 0,5 × 6000 = 3000 birimkare.");
    // Yazarın yuvarladığı sonuç yalnız kaydırılır, yeniden hesaplanmaz.
    expect(fix("1.500 × 2,333 = 3,5").text).toBe("1.500 × 2,333 = 3.500");
  });

  it("bir metinde birden çok eşitlik ayrı ayrı ele alınır", () => {
    const out = fix("Önce 1.200 × 3 = 3,6 bulunur.\nSonra 20 × 4 = 80 eklenir.\nEn son 2.000 ÷ 4 = 0,5 çıkar.");
    expect(out.text).toBe("Önce 1.200 × 3 = 3.600 bulunur.\nSonra 20 × 4 = 80 eklenir.\nEn son 2.000 ÷ 4 = 500 çıkar.");
    expect(out.fixes).toBe(2);
  });
});

describe("başka her durumda metne dokunulmaz", () => {
  const untouched = [
    // Doğru eşitlikler.
    "1.200 × 3 = 3.600",
    "2,5 × 4 = 10",
    "250 × 8 = 2.000 birim",
    "4.500 ÷ 9 = 500",
    // Yuvarlama ve yaklaşık eşitlik.
    "3,14 × 2 = 6,3",
    "7 ÷ 3 = 2,33",
    "1.200 × 3 ≈ 3,6",
    // Ayırıcı imzası taşımayan gerçek hesap hatası başka kuralın işidir.
    "12 × 12 = 124",
    "1.200 × 3 = 4.600",
    "2,5 × 4 = 100",
    // Hiç ayırıcı yoksa ayırıcı karışıklığı da yoktur.
    "25 × 4 = 100000",
    // Birim dönüşümü ve büyüklük sözcüğü.
    "1.500 g × 2 = 3 kg",
    "2.000 m × 3 = 6 km",
    "5 m/s × 3 s = 15 m",
    "1.500 × 2 = 3 bin",
    "2 bin × 3 = 6.000",
    // Bilimsel gösterim ve süren işlem.
    "1.500 × 2 = 3 × 10³",
    "4 + 1.500 × 2 = 3.004",
    "1.500 × 2 = 3 + 2.997",
    "6 × 1.500 × 2 = 18.000",
    // Değişkenli ifade.
    "2x × 3 = 6x",
    "1.500x × 2 = 3x",
    "a × 2,5 = 10",
    // Yüzde.
    "%20 × 1.500 = 300",
    "1.500 × 2 = 3%",
    // Aralık, tarih, saat, sürüm.
    "3-5 × 2 = 10",
    "Sınav 12.05.2026 tarihinde, saat 09:30'da.",
    "Sürüm 2.10.3 × 2 = 4 değildir.",
    // Kod.
    "Kodda `1.200 * 3 = 3.6` yazıyor.",
    "```\n1.200 * 3 = 3.6\n```",
    // Sohbet işaretleri.
    "[[chip:Devam|1.200 × 3 = 3,6]]",
    // Karşılaştırma ve vurgu işaretleri.
    "1.200 × 3 == 3,6",
    "1.200 × 3 >= 3,6",
  ];

  for (const text of untouched) {
    it(`dokunulmaz: ${text.replace(/\n/g, " ⏎ ")}`, () => {
      const out = fix(text);
      expect(out.text).toBe(text);
      expect(out.fixes).toBe(0);
    });
  }

  it("nokta-ondalık yazan metinde (ondalık virgül hiç yok) nokta binlik sayılmaz", () => {
    const text = "Yarıçap 2.5 alınırsa 1.250 × 4 = 5 olur.";
    expect(fix(text)).toEqual({ text, fixes: 0 });
  });

  it("boş ve sayısız metin olduğu gibi döner", () => {
    expect(fix("")).toEqual({ text: "", fixes: 0 });
    expect(fix("Merhaba, bugün ne çalışalım?")).toEqual({ text: "Merhaba, bugün ne çalışalım?", fixes: 0 });
  });
});

describe("kaynağındaki hata: binlik noktalı doğru eşitlik artık bozulmaz", () => {
  it("sohbet çözüm sağlaması doğru sonucu bin kat küçültüp yazmaz", () => {
    // Düzeltmeden önce: "4.500 ÷ 9 = 500" → "4.500 ÷ 9 = 0,5" (nokta ondalık okunuyordu).
    const division = "Kişi başı: 4.500 ÷ 9 = 500 lira eder ve bu sonuç tutarlıdır.";
    expect(prepareChatSolution(division)).toBe(division);
    const product = "Alan: 0,5 × 6.000 = 3000 birimkare olur ve bu sonuç tutarlıdır.";
    expect(prepareChatSolution(product)).toBe(product);
    const grouped = "Toplam: 250 × 8 = 2.000 birim olur ve bu sonuç tutarlıdır.";
    expect(prepareChatSolution(grouped)).toBe(grouped);
  });

  const TR = { thousandsDots: true };

  it("binlik okuma açıkken nicel denetim doğru eşitliği ve dönüşümü sorun saymaz; gerçek hatayı sayar", () => {
    expect(auditQuantitative("4.500 ÷ 9 = 500", "", TR).issues).toEqual([]);
    expect(auditQuantitative("1.250.000 × 2 = 2.500.000", "", TR).issues).toEqual([]);
    expect(auditQuantitative("1.500 g = 1,5 kg", "", TR).issues).toEqual([]);
    expect(auditQuantitative("12 × 12 = 124", "", TR).issues.length).toBeGreaterThan(0);
    expect(auditQuantitative("4.500 ÷ 9 = 600", "", TR).issues.length).toBeGreaterThan(0);
  });

  it("binlik okuma açıkken adım aritmetiği doğru adımı tutmuyor saymaz; gerçek hatayı sayar", () => {
    expect(stepArithmeticIssues("4.500 ÷ 9 = 500", TR)).toEqual([]);
    expect(stepArithmeticIssues("0,5 × 6.000 = 3.000", TR)).toEqual([]);
    expect(stepArithmeticIssues("4.500 ÷ 9 = 600", TR)).not.toEqual([]);
    expect(stepArithmeticIssues("12 × 12 = 124", TR)).not.toEqual([]);
  });

  it("okuma varsayılan olarak KAPALI: yazılı deneme, sözlü, soru çözücü ve podcast denetimi eskisi gibi", () => {
    // Seçenek verilmeyince iki dosya da 10 Kasım öncesindeki gibi davranır (nokta ondalık okunur).
    expect(stepArithmeticIssues("4.500 ÷ 9 = 500")).toEqual(["4.500 ÷ 9 ≠ 500"]);
    expect(stepArithmeticCheck("4.500 ÷ 9 = 500")).toEqual({ issues: ["4.500 ÷ 9 ≠ 500"], verified: 0 });
    expect(stepArithmeticCheck("12 × 3 = 36")).toEqual({ issues: [], verified: 1 });
    expect(auditQuantitative("4.500 ÷ 9 = 500").issues.map((issue) => issue.repair)).toEqual(["4.500 ÷ 9 = 0,5"]);
    expect(auditQuantitative("4.500 ÷ 9 = 500", "", { generalAbsolutes: false }).ok).toBe(false);
    // Seçeneği yalnız sohbet açar.
    const callers = [
      "src/lib/learning/mock-exam/grade.ts",
      "src/lib/learning/mock-exam/work-steps.ts",
      "src/lib/learning/oral-exam.ts",
      "src/lib/learning/question-verifier.ts",
      "src/lib/learning/teacher-podcast.ts",
      "src/lib/solve/question-solver.ts",
    ];
    for (const file of callers) expect(readFileSync(file, "utf8"), file).not.toContain("thousandsDots");
    expect(readFileSync("src/lib/ai/chat-solve-check.ts", "utf8")).toContain("const TURKISH_READING = { thousandsDots: true } as const;");
  });
});

describe("sohbet ucu düzelticiyi kayıttan önce uygular", () => {
  const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");

  it("kaydedilen ve gösterilen metin aynı: düzeltme complete_chat_operation'dan ve kaynak işaretlerinden önce", () => {
    const fixAt = route.indexOf("verifyAndFixTurkishMathExpressions(content)");
    expect(fixAt).toBeGreaterThan(0);
    expect(fixAt).toBeLessThan(route.indexOf('service.rpc("complete_chat_operation"'));
    expect(fixAt).toBeLessThan(route.indexOf("citationMarker({"));
    // Çözüm sağlamasından (satır düşüren kural) sonra: son söz düzelticinin.
    expect(fixAt).toBeGreaterThan(route.indexOf("content = prepareChatSolution(content)"));
  });

  it("günlük yalnız sayı taşır, metin taşımaz", () => {
    expect(route).toMatch(/console\.warn\("chat_math_separator_fixed", \{ operationId, fixes: mathFix\.fixes \}\)/);
  });
});
