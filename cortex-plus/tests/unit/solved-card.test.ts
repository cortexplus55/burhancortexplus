import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isProblemQuestion, solvedLabel } from "@/lib/learning/solved-card";

/*
  Astra hesap sorusunda cevabın üstünde "Problem 5 saniyede çözüldü" kartı
  gösteriyor; ürün sahibi eklenmesini seçti (1 Ekim 2026). Süre tarayıcıda
  ölçülür, model çağrısı yok.
*/
describe("çözüm süresi kartı", () => {
  it.each([
    "10 g CaCO3 kaç mol?",
    "[Matematik] 3x + 5 = 20 ise x kaçtır?",
    "sin 30° + cos 60° hesapla",
    "2^10 sonucu nedir",
    "√49 × 3",
  ])("%s bir problemdir", (text) => {
    expect(isProblemQuestion(text)).toBe(true);
  });

  it.each([
    "Calvin döngüsü nasıl işler?",
    "Pisagor teoremi nedir, kısaca açıklar mısın?",
    "1. Dünya Savaşı neden çıktı?",
  ])("%s bir problem değildir", (text) => {
    expect(isProblemQuestion(text)).toBe(false);
  });

  it("süre saniyeye yuvarlanır, en az 1 saniye", () => {
    expect(solvedLabel(4600)).toBe("Problem 5 saniyede çözüldü");
    expect(solvedLabel(120)).toBe("Problem 1 saniyede çözüldü");
  });

  it("sohbette yalnızca problem sorusunda ve cevap bitince gösterilir", () => {
    const panel = readFileSync("src/components/chat/chat-panel.tsx", "utf8");
    expect(panel).toContain("isProblemQuestion(text)");
    expect(panel).toContain("solvedLabel(message.solvedMs)");
  });
});
