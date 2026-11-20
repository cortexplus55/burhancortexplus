import { describe, expect, it } from "vitest";
import { settleVoice } from "@/lib/ai/teacher-voice";
import { prepareChatSolution } from "@/lib/ai/chat-solve-check";
import { stripModelActionMarkers } from "@/lib/ai/chat-material-link";
import { settleOneMove } from "@/lib/ai/teacher-v2";
import { dropSourceLabels, settlePedagogicalLabels, stripOrphanCitations } from "@/lib/ai/chat-answer-settle";
import { studentOutputText } from "@/lib/learning/student-output-firewall";
import { auditQuantitative, repairQuantitative } from "@/lib/learning/tutor-quant";
import { verifyAndFixTurkishMathExpressions } from "@/lib/learning/turkish-math-fix";
import { checkSimpleMathClaims } from "@/lib/learning/quantitative-audit";
import { isInsideSymbolicMath, isSymbolicMathExpression, lineHasSymbolicEquation } from "@/lib/text/symbolic-math";

/**
 * Faz 2, madde 1: değişkenli, LaTeX'li ve kimyasal oklu ifadeler son-işleyiciden tek bir karakter bile bozulmadan
 * geçer. Örnekler yalnız spesifikasyonun kendi ifadeleridir.
 */
const SPEC = ["2x + 7 = 19", "x^2 - 4 = 0", "\\frac{2x+1}{3} = 5", "2H2 + O2 -> 2H2O", "3a - 4 = 11", "Fe + O2 -> Fe2O3"];

/** Sohbet cevabının kayıttan önce geçtiği bütün metin son-işleyicileri (route.ts sırasıyla). */
const PIPELINE: Record<string, (text: string) => string> = {
  studentOutputText,
  prepareChatSolution,
  quantRepair: (text) => {
    const audit = auditQuantitative(text, "", { thousandsDots: true });
    return audit.ok ? text : repairQuantitative(text, audit);
  },
  quantRepairDefault: (text) => {
    const audit = auditQuantitative(text, "");
    return audit.ok ? text : repairQuantitative(text, audit);
  },
  settlePedagogicalLabels: (text) => settlePedagogicalLabels(text),
  dropSourceLabels,
  settleOneMove: (text) => settleOneMove(text).text,
  settleVoice: (text) => settleVoice(text).text,
  stripModelActionMarkers,
  turkishMathFix: (text) => verifyAndFixTurkishMathExpressions(text).text,
  stripOrphanCitations: (text) => stripOrphanCitations(text, []),
};

function runPipeline(text: string): string {
  return Object.values(PIPELINE).reduce((acc, step) => step(acc), text);
}

describe("matematik koruması — son-işleyici", () => {
  for (const expr of SPEC) {
    for (const [name, step] of Object.entries(PIPELINE)) {
      it(`${name}: "${expr}" aynen kalır`, () => {
        expect(step(expr)).toBe(expr);
      });
    }
    it(`tam zincir: "${expr}" karakteri karakterine aynı`, () => {
      expect(runPipeline(expr)).toBe(expr);
    });
    it(`deterministik denetim "${expr}" için sorun bildirmez`, () => {
      expect(auditQuantitative(expr, "").issues.filter((issue) => issue.kind === "arithmetic")).toEqual([]);
      expect(checkSimpleMathClaims(expr)).toEqual([]);
    });
  }

  it("değişkenli denklemin ara adımı 'iki taraf eşit değil' diye değiştirilmez", () => {
    const step = "İki taraftan 7 çıkar: 2x + 7 − 7 = 19 − 7, yani 2x = 12.";
    const out = runPipeline(step);
    expect(out).toBe(step);
    expect(out).not.toMatch(/eşit değil/);
  });

  it("LaTeX blok içindeki ifade aynen kalır", () => {
    const block = "$$\\frac{2x+1}{3} = 5$$";
    expect(runPipeline(block)).toBe(block);
  });

  it("satır içinde birden çok ifade de aynen kalır", () => {
    const line = "2x + 7 = 19 ve x^2 - 4 = 0";
    expect(runPipeline(line)).toBe(line);
  });

  it("kutu etiketi '📌 Sınav ipucu:' kaydedilen metinde kesilmez", () => {
    const box = "> 📌 Sınav ipucu: 2x + 7 = 19 gibi bir denklemde iki tarafa aynı işlemi uygula.";
    expect(studentOutputText(box)).toBe(box);
    expect(runPipeline(box)).toContain("📌 Sınav ipucu:");
  });

  it("ham 'İpucu:' öneki yine düşer (kutu etiketi dışında)", () => {
    expect(studentOutputText("İpucu: iki tarafa aynı işlemi uygula.")).toBe("iki tarafa aynı işlemi uygula.");
  });
});

describe("sembolik ifade tanıma", () => {
  it("değişken, LaTeX, ok ve eşitsizlik sembolik sayılır", () => {
    for (const expr of SPEC) expect(isSymbolicMathExpression(expr)).toBe(true);
    expect(isSymbolicMathExpression("2 + 3 < 7")).toBe(true);
    expect(isSymbolicMathExpression("x ≤ 5")).toBe(true);
  });

  it("birimli ve düz aritmetik sembolik değildir; denetim sürer", () => {
    expect(isSymbolicMathExpression("14 g + 4 g = 18 g")).toBe(false);
    expect(isSymbolicMathExpression("3 x 4 = 12")).toBe(false);
    expect(isSymbolicMathExpression("6,02 × 10²³")).toBe(false);
    const wrong = "Toplam 5 + 3 = 9 olur.";
    expect(auditQuantitative(wrong, "").ok).toBe(false);
  });

  it("eşleşme değişkenli tarafın içindeyse sembolik; yalnız nicelik adıysa değil", () => {
    const text = "2x + 7 − 7 = 19 − 7";
    const start = text.indexOf("7 − 7");
    expect(isInsideSymbolicMath(text, start, text.length)).toBe(true);
    const named = "N = 2 × 3 = 6";
    const at = named.indexOf("2 × 3");
    expect(isInsideSymbolicMath(named, at, named.length)).toBe(false);
  });

  it("satır düzeyinde sembolik denklem bulunur", () => {
    expect(lineHasSymbolicEquation("x^2 - 4 = 0")).toBe(true);
    expect(lineHasSymbolicEquation("5 + 3 = 8")).toBe(false);
  });
});
