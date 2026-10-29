import { describe, expect, it } from "vitest";
import {
  MATH_SPAN_RE,
  bracketSpans,
  firstIndexOutsideBrackets,
  insideSpan,
  matchesOutsideBrackets,
  splitOutsideBrackets,
} from "@/lib/text/bracket-spans";
import { splitMath } from "@/lib/learning/math-text";

/*
  Ayraç aralıkları yardımcısı (29 Ekim 2026). Tahta bölücüleri bu modülden "derinlik 0 mı" diye
  sorar; buradaki kurallar bozulursa küme, koordinat ve aralık yeniden satırlara kırılır.
*/

const SENTENCE_BREAK = /(?<=[.!?])\s+(?=\*{0,2}[A-ZÇĞİÖŞÜ0-9“"(])/;

describe("bracketSpans", () => {
  it("eşleşmeyen kapanış aralık üretmez: 'a) şıkkı' bölmeyi değiştirmez", () => {
    expect(bracketSpans("a) şıkkı doğru, b) yanlış")).toEqual([]);
    expect(splitOutsideBrackets("a) şıkkı doğru, b) yanlış", /,\s+/)).toEqual(["a) şıkkı doğru", "b) yanlış"]);
  });

  it("kapanmayan açılış aralık üretmez", () => {
    expect(bracketSpans("f(x")).toEqual([]);
    expect(bracketSpans("Örnek (a: f(x) = 2x. Sonraki cümle.")).toEqual([[11, 13]]);
  });

  it("iç içe çiftlerin hepsini verir", () => {
    expect(bracketSpans("{(1, 2), (3, 4)}")).toEqual([
      [0, 15],
      [1, 6],
      [9, 14],
    ]);
  });

  it("$…$ matematiği opaktır: içindeki ayraç ayrıca sayılmaz, dışındaki sayılır", () => {
    expect(bracketSpans("$f(1, 2)$ ve (3, 4)")).toEqual([
      [0, 8],
      [13, 18],
    ]);
    expect(bracketSpans("\\(x = (1, 2)\\) sonra")).toEqual([[0, 13]]);
  });

  it("para birimi matematik değildir — splitMath ile aynı karar", () => {
    const money = "Fiyat 5 $ ile 10 $ arasında.";
    expect(bracketSpans(money)).toEqual([]);
    expect(splitMath(money).every((segment) => segment.type === "text")).toBe(true);
  });

  it("'|' izlenmez: küme kurucu yalnız dıştaki küme ile korunur", () => {
    expect(bracketSpans("{x | x > 0}")).toEqual([[0, 10]]);
    expect(bracketSpans("P(A | B) ve |x| > 2")).toEqual([[1, 7]]);
  });

  it("yarı açık aralık tek çifttir; küme ile parantez birbirini kapatmaz", () => {
    expect(bracketSpans("[−1, 2)")).toEqual([[0, 6]]);
    expect(bracketSpans("(0, 2]")).toEqual([[0, 5]]);
    expect(bracketSpans("{1, 2)")).toEqual([]);
    expect(bracketSpans("⟨u, v⟩ ve ⌊x⌋ ve ⌈y⌉")).toEqual([
      [0, 5],
      [10, 12],
      [17, 19],
    ]);
  });

  it("yer tutucular (U+E000, U+E100/U+E101) düz metindir", () => {
    expect(bracketSpans("0 2 ay (a, b)")).toEqual([[10, 15]]);
  });

  it("çok uzun bir çift kaçak sayılır, paragrafı yutmaz", () => {
    const long = `(${"a ".repeat(200)})`;
    expect(bracketSpans(long)).toEqual([]);
    expect(bracketSpans(`(${"a ".repeat(20)})`)).toEqual([[0, 41]]);
  });
});

describe("insideSpan", () => {
  it("açılış dışarıda, kapanış içeride sayılır", () => {
    const spans = bracketSpans("x (1, 2) y");
    expect(insideSpan(spans, 2)).toBe(false);
    expect(insideSpan(spans, 3)).toBe(true);
    expect(insideSpan(spans, 7)).toBe(true);
    expect(insideSpan(spans, 8)).toBe(false);
  });
});

describe("splitOutsideBrackets", () => {
  it("derinlik 0'da String.split ile birebir aynı parçalar — lookbehind'lı cümle deseni dahil", () => {
    const texts = [
      "Bir cümle. İkinci cümle! Üçüncü? 4 kPa ile biter.",
      "1 kPa = 1000 Pa, 1 MPa = 1000 kPa, 2 bar = 200 kPa",
      "a; b ;c;  d",
      "1. P = F/A 2. W = F · d 3) Q = mcΔT",
    ];
    const regexes = [SENTENCE_BREAK, /,\s+(?=\d)/, /\s*;\s*/, /\s+(?=\d{1,2}\)\s+|\d{1,2}\.\s+[^\sa-zçğıöşü])/];
    for (const text of texts) {
      for (const re of regexes) {
        expect(splitOutsideBrackets(text, re), `${text} ~ ${re}`).toEqual(text.split(re));
      }
    }
  });

  it("ayraç içindeki eşleşme bölmez", () => {
    expect(splitOutsideBrackets("Bir. İki (üç. Dört) beş. Altı", SENTENCE_BREAK)).toEqual([
      "Bir.",
      "İki (üç. Dört) beş.",
      "Altı",
    ]);
    expect(splitOutsideBrackets("(1,5; 2) için y = 2x; g = 3", /\s*;\s*/)).toEqual(["(1,5; 2) için y = 2x", "g = 3"]);
    expect(splitOutsideBrackets("$f(1, 2)$ ve 3, 4", /,\s+(?=\d)/)).toEqual(["$f(1, 2)$ ve 3", "4"]);
  });

  it("accept süzgeci yalnız kabul edilen eşleşmede keser", () => {
    expect(splitOutsideBrackets("a, 1, 2", /,\s+(?=\d)/, (match) => match.index > 2)).toEqual(["a, 1", "2"]);
  });
});

describe("matchesOutsideBrackets / firstIndexOutsideBrackets", () => {
  it("bütün metin üzerinde çalışır, yalnız dıştakileri verir", () => {
    const text = "T < T_sat(P) ve (T > T_sat(P) koşulu)";
    const found = matchesOutsideBrackets(text, /T\s*[<>]\s*T_sat\(P\)/g).map((match) => match.index);
    expect(found).toEqual([0]);
    expect(firstIndexOutsideBrackets("f(x) = 2x", /[=<>≤≥]/)).toBe(5);
    expect(firstIndexOutsideBrackets("{x = 1}", /=/)).toBe(-1);
    expect(firstIndexOutsideBrackets("a = b = c", /=/, 3)).toBe(6);
  });

  it("global olmayan desen de kabul edilir; paylaşılan desenin lastIndex'i kirlenmez", () => {
    expect(matchesOutsideBrackets("1:3 ve x: y", /:/).map((match) => match.index)).toEqual([1, 8]);
    bracketSpans("$a$ ve $b$");
    expect(MATH_SPAN_RE.lastIndex).toBe(0);
  });
});

describe("MATH_SPAN_RE math-text ile tek kaynak", () => {
  it("splitMath'in tanıdığı dört gösterimi tanır", () => {
    for (const sample of ["$$a$$", "\\[a\\]", "\\(a\\)", "$a$"]) {
      expect(new RegExp(MATH_SPAN_RE.source).test(sample), sample).toBe(true);
      expect(splitMath(sample).some((segment) => segment.type === "math"), sample).toBe(true);
    }
    expect(new RegExp(MATH_SPAN_RE.source).test("5 $ ve 10 $")).toBe(false);
  });
});
