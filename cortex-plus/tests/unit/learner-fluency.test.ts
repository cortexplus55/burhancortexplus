import { describe, expect, it } from "vitest";
import {
  isContextlessFragment,
  isEchoOfPriorText,
  isWellFormedTurkishSentence,
  repairTurkishSurface,
  scanFluencyIssues,
  turkishSurfaceIssues,
} from "@/lib/learning/learner-fluency";

describe("repairTurkishSurface", () => {
  it("fizikte izafet yönelmesini iyelik ekine çevirir", () => {
    expect(repairTurkishSurface("Devrede akım şiddete ile ölçülür.")).toBe(
      "Devrede akım şiddeti ile ölçülür.",
    );
    expect(repairTurkishSurface("Okula gitti.")).toBe("Okula gitti.");
  });

  it("tarihte tamlayan ekinden sonra iyelik bekler", () => {
    expect(repairTurkishSurface("Fermanın maddeye ile ilan edildi.")).toBe(
      "Fermanın maddesi ile ilan edildi.",
    );
    expect(repairTurkishSurface("Akım şiddete.")).toBe("Akım şiddeti.");
  });

  it("doğru iyelik ve edatları bozmaz", () => {
    expect(repairTurkishSurface("Yay uzunluğu ile ilişkilidir.")).toBe(
      "Yay uzunluğu ile ilişkilidir.",
    );
    expect(repairTurkishSurface("Kısa açıklama ile başlar.")).toBe(
      "Kısa açıklama ile başlar.",
    );
  });
});

describe("cümle bütünlüğü", () => {
  it("şablon artığını reddeder", () => {
    expect(
      isWellFormedTurkishSentence(
        "Hangi maddenin ters çevrilirse cümle, kaynağın kurduğu tanımdan kopar.",
      ),
    ).toBe(false);
    expect(
      isWellFormedTurkishSentence(
        "Hangi şiirin cümlede kurulduğu anlama uyuyor.",
      ),
    ).toBe(false);
  });

  it("düzgün fizik ve tarih cümlesini geçirir", () => {
    expect(
      isWellFormedTurkishSentence("Ohm yasasında gerilim akım ile direncin çarpımıdır."),
    ).toBe(true);
    expect(
      isWellFormedTurkishSentence("Tanzimat fermanı 1839'da ilan edildi."),
    ).toBe(true);
  });

  it("onarılmayan şablon issue olarak kalır", () => {
    const scanned = scanFluencyIssues(
      "Hangi dizenin ters çevrilirse cümle, kaynağın kurduğu tanımdan kopar.",
    );
    expect(scanned.issues.length).toBeGreaterThan(0);
    expect(turkishSurfaceIssues("Devrede akım şiddete.").length).toBeGreaterThan(0);
    expect(turkishSurfaceIssues(repairTurkishSurface("Devrede akım şiddete.")).length).toBe(0);
  });
});

describe("yankı ve bağlamsız özet", () => {
  it("tarih cümlesinin aynısını yankı sayar", () => {
    const sentence = "Tanzimat fermanı 1839'da ilan edildi.";
    expect(isEchoOfPriorText(sentence, [sentence])).toBe(true);
    expect(isEchoOfPriorText("Ferman 1839'dan önce ilan edildi.", [sentence])).toBe(false);
  });

  it("bağlamsız diğer cümlesini eler", () => {
    expect(isContextlessFragment("Diğer büyüklük ise artar.")).toBe(true);
    expect(isContextlessFragment("Direnç akımla ters orantılıdır.")).toBe(false);
  });
});
