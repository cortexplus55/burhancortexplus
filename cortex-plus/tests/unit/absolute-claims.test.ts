import { describe, expect, it } from "vitest";
import {
  absoluteClaimIssues,
  unsupportedAbsoluteClaims,
} from "@/lib/learning/absolute-claims";
import { validateTrueFalsePedagogy } from "@/lib/learning/teaching-standards";

const ohmSource = "Ohm yasası gerilim, akım ve direnç arasındaki bağıntıyı V = I R olarak kurar.";
const historySource = "1830'larda Avrupa'nın birkaç kentinde ayaklanmalar oldu.";

describe("unsupported absolute claims", () => {
  it("fizikte kaynaksız yalnızca iddiasını düşürür", () => {
    const issues = unsupportedAbsoluteClaims(
      "Direnç sadece gerilime bağlıdır, başka hiçbir şeye değil.",
      ohmSource,
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it("tarihte kaynaksız her zaman iddiasını düşürür", () => {
    const issues = unsupportedAbsoluteClaims(
      "1830 her zaman Avrupa'nın tek dönüm noktasıdır.",
      historySource,
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it("kaynak aynı kısıtı kurmuşsa geçirir", () => {
    const source = "Direnç yalnızca sıcaklıkla değişir; gerilim onu değiştirmez.";
    expect(
      unsupportedAbsoluteClaims("Direnç yalnızca sıcaklıkla değişir.", source),
    ).toEqual([]);
  });

  it("yanlış işaretli önermeyi iddia saymaz", () => {
    const parsed = {
      items: [
        {
          text: "Direnç sadece gerilime bağlıdır.",
          correct: false,
          explanation: "Direnç iletkenin kendisine bağlıdır, gerilime değil.",
          correctedStatement: "Direnç iletkenin özelliğidir.",
        },
      ],
    };
    expect(absoluteClaimIssues(parsed, ohmSource)).toEqual([]);
  });

  it("doğru işaretli kesin iddiayı kaynak yokken reddeder", () => {
    expect(
      validateTrueFalsePedagogy([
        {
          text: "Direnç her zaman yalnızca gerilime bağlıdır.",
          correct: true,
          explanation: "Bu ifade kaynağın kurduğu bağıntıdan daha dar.",
        },
      ]).some((issue) => issue.includes("kesin iddia")),
    ).toBe(true);
  });
});
