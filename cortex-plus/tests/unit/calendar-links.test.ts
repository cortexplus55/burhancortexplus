import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Astra'da "Takvimim" sade bir takvim açar (ay görünümü, yaklaşan sınavlar,
  etkinlik ekle). Bizde /takvimim tam bunu yapıyordu ama menü ve sınav
  sohbeti menüsü çalışma planının tamamına gidiyordu (30 Eylül 2026).
*/
describe("Takvimim bağlantıları", () => {
  it.each(["src/components/parity/sor-shell.tsx", "src/components/parity/exam-chat-menu.tsx"])(
    "%s takvim sayfasına gider",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("/calisma-plani?tab=takvim");
      expect(source).toContain('"/takvimim"');
    },
  );
});
