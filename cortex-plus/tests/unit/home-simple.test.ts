import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Astra'nın ana sayfasında selamın altında yalnızca "Başla" var. Bizde üç
  kısayol, "Günün turu" ve üç kaynak seçeneği de duruyordu; ürün sahibi
  Astra gibi sade olmasını seçti (30 Eylül 2026).
*/
describe("ana sayfa sade", () => {
  const page = readFileSync("src/app/ogretmen/page.tsx", "utf8");
  const panel = readFileSync("src/components/chat/chat-panel.tsx", "utf8");

  it("boş ekrana kısayol, alt satır ve günün turu gönderilmiyor", () => {
    expect(page).not.toContain("starterPrompts=");
    expect(page).not.toContain("greetingSubline=");
    expect(page).not.toContain("dailyDrillCount");
    expect(page).toContain('startLabel="Başla"');
  });

  it("kaynak seçimi ilk mesajdan sonra görünüyor; belgeden gelindiyse baştan", () => {
    expect(panel).toContain("showParityEmpty && !examChrome && !initialDocumentId ? null : renderSourceMode(true)");
  });
});
