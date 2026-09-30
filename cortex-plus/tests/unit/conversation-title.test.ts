import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanConversationTitle } from "@/lib/ai/conversation-title-text";

/*
  Astra her sohbete kısa başlık + emoji veriyor ("Mol, Gazlar ve Stokiyometri
  Çalışması 🧪"). Bizde ilk mesajın ilk 60 harfi duruyordu: "[Matematik]
  Bosluk orani ile porozite arasindaki iliski nedi" (30 Eylül 2026).
*/
describe("sohbet başlığı", () => {
  it("modelin başlığını olduğu gibi alır, emojiyi korur", () => {
    expect(cleanConversationTitle("Mol, Gazlar ve Stokiyometri Çalışması 🧪")).toBe(
      "Mol, Gazlar ve Stokiyometri Çalışması 🧪",
    );
  });

  it("tırnak, etiket ve sondaki noktayı temizler", () => {
    expect(cleanConversationTitle('Başlık: "Boşluk Oranı ve Porozite 🪨".')).toBe("Boşluk Oranı ve Porozite 🪨");
    expect(cleanConversationTitle("**Calvin Döngüsü 🌿**\n\nAçıklama")).toBe("Calvin Döngüsü 🌿");
  });

  it("boş, harfsiz ya da çok uzun cevapta eski başlık kalır", () => {
    expect(cleanConversationTitle("")).toBeNull();
    expect(cleanConversationTitle("🧪")).toBeNull();
    expect(cleanConversationTitle("a".repeat(80))).toBeNull();
  });

  it("yalnızca yeni sohbette, cevap gittikten sonra çalışır", () => {
    const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
    expect(route).toContain("after(() =>");
    expect(route).toContain("!rest.conversationId && savedConversationId");
    const source = readFileSync("src/lib/ai/conversation-title.ts", "utf8");
    // Öğrenciden ücret alınmaz; yalnızca maliyet kaydı düşer.
    expect(source).not.toContain("reserveCredits");
    expect(source).toContain('actionCode: "CHAT_TITLE"');
  });
});
