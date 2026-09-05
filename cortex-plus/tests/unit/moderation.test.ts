import { describe, expect, it } from "vitest";
import { classify } from "@/lib/ai/moderation";

describe("içerik denetimi kararı", () => {
  it("temiz metni geçirir", () => {
    expect(classify([]).action).toBe("allow");
  });

  it("ders konusu olabilecek işaretleri engellemez, yalnızca kaydeder", () => {
    // Tarih dersinde savaş, edebiyatta şiddet, biyolojide üreme geçer.
    // Bunları engellemek en çok dersin kendisini vururdu.
    expect(classify(["violence"]).action).toBe("flag");
    expect(classify(["sexual"]).action).toBe("flag");
    expect(classify(["harassment"]).action).toBe("flag");
  });

  it("küçüklerin cinselleştirilmesini her koşulda engeller", () => {
    const decision = classify(["sexual/minors"]);
    expect(decision.action).toBe("block");
  });

  it("eyleme yönelen kategorileri engeller", () => {
    expect(classify(["self-harm/instructions"]).action).toBe("block");
    expect(classify(["illicit/violent"]).action).toBe("block");
    expect(classify(["hate/threatening"]).action).toBe("block");
  });

  it("kendine zarar sinyalinde reddetmek yerine destek verir", () => {
    const decision = classify(["self-harm", "self-harm/intent"]);
    expect(decision.action).toBe("support");
    if (decision.action !== "support") throw new Error("beklenmeyen karar");
    // Yardım hattı yanıtın içinde olmalı; "yardımcı olamam" deyip kapatan
    // bir cevap, yardım isteyen bir genci yalnız bırakır.
    expect(decision.message).toContain("183");
    expect(decision.message).toContain("112");
  });

  it("engel gerektiren kategori varsa destek kararının önüne geçer", () => {
    // "Nasıl yapılır" isteyen bir istek, kendine zarar sinyaliyle birlikte
    // gelse bile yönerge üretilmemeli.
    expect(classify(["self-harm", "self-harm/instructions"]).action).toBe(
      "block",
    );
  });
});
