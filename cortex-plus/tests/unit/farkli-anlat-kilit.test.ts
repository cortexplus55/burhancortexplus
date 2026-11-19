/**
 * Faz 2 (madde 7.1): "Farklı anlat" 2. ve 3. çağrıda DEĞİŞMEZ OLGULAR kilitli. Olgular her çağrıda adımın İLK
 * anlatımından çıkar; önceki farklı anlatımlar olgu kaynağı değildir (yalnız açılışları, tekrar etmesin diye).
 * Cevap adımda olmayan bir sayı getirirse taslak reddedilir.
 */
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  PREVIOUS_OPENING_MAX,
  extractImmutableFacts,
  introducedNumbers,
  numberTokens,
  reexplainUserPrompt,
} from "@/lib/learning/step-reexplain";

const STEP = "**Terim A** bir büyüklüktür. ==Eşik== değeri 37,5 birimdir. Formül: x = 2y + 15. Oran %40 olarak alınır.";
const base = { prepTitle: "Sınav", topicLabel: "Konu", heading: "Adım", text: STEP };

describe("extractImmutableFacts", () => {
  it("vurgulanan terimler, formül ve sayılar ilk anlatımdan çıkar", () => {
    const facts = extractImmutableFacts(STEP);
    expect(facts).toContain("Terim A");
    expect(facts).toContain("Eşik");
    expect(facts.some((fact) => fact.includes("x = 2y + 15"))).toBe(true);
    expect(facts.some((fact) => fact.startsWith("37,5"))).toBe(true);
    expect(facts.some((fact) => fact.includes("%40"))).toBe(true);
  });

  it("sayısız düz metinde boş", () => {
    expect(extractImmutableFacts("Kısa bir açıklama cümlesi.")).toEqual([]);
  });
});

describe("kilit 2. ve 3. çağrıda", () => {
  const first = reexplainUserPrompt(base);
  const drifted = "Eşik değeri 40 birim gibi düşün; formül x = 3y + 15 olur. Kısaca: başka bir anlatım.";
  const second = reexplainUserPrompt({ ...base, previous: [drifted] });
  const third = reexplainUserPrompt({ ...base, previous: [drifted, "Bir başka benzetme. Kısaca: özet."] });

  const lockOf = (prompt: string) => prompt.slice(prompt.indexOf("DEĞİŞMEZ OLGULAR"), prompt.indexOf("\n\n", prompt.indexOf("DEĞİŞMEZ OLGULAR")) >>> 0);

  it("her çağrıda aynı kilitli liste (önceki cevaplardan etkilenmez)", () => {
    expect(first).toContain("DEĞİŞMEZ OLGULAR");
    expect(lockOf(second)).toBe(lockOf(first));
    expect(lockOf(third)).toBe(lockOf(first));
    expect(lockOf(second)).not.toContain("3y");
  });

  it("2. ve 3. çağrı önceki anlatımların olgu kaynağı olmadığını söyler ve yalnız açılışlarını verir", () => {
    expect(second).toContain("2. farklı anlatımı");
    expect(third).toContain("3. farklı anlatımı");
    expect(second).toContain("OLGU KAYNAĞI DEĞİLDİR");
    const long = "a".repeat(PREVIOUS_OPENING_MAX + 200);
    const prompt = reexplainUserPrompt({ ...base, previous: [long] });
    expect(prompt).toContain(`- ${"a".repeat(PREVIOUS_OPENING_MAX)}\n`.trimEnd());
    expect(prompt).not.toContain("a".repeat(PREVIOUS_OPENING_MAX + 1));
  });
});

describe("introducedNumbers", () => {
  it("adımda olmayan sayı yeni olgudur; adımın sayıları ve küçük sayma sayıları serbest", () => {
    expect(introducedNumbers("Eşik 37,5 birim, oran %40; iki adımda: 1. ve 2.", STEP)).toEqual([]);
    expect(introducedNumbers("Eşik 40 birim.", STEP)).toEqual([]);
    expect(introducedNumbers("Eşik 38 birim, formül x = 2y + 16.", STEP)).toEqual(["38", "16"]);
  });

  it("ondalık virgül ve nokta aynı; binlik ayırıcı düşer", () => {
    expect(numberTokens("37,5 ve 37.5 ve 1.250.000")).toEqual(["37.5", "37.5", "1250000"]);
    expect(introducedNumbers("37.5", STEP)).toEqual([]);
  });

  it("uç: kayan sayı taslağı reddeder ve nedenini modele söyler (aynı rezervasyonla yeniden yazım)", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/reexplain/route.ts", "utf8");
    expect(route).toContain("introducedNumbers(reply.reply, parsed.data.text)");
    expect(route).toMatch(/describeParseFailure: \(\) =>/);
  });
});
