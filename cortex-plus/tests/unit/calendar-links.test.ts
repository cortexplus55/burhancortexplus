import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  kıyas ürününde "Takvimim" sade bir takvim açar (ay görünümü, yaklaşan sınavlar,
  etkinlik ekle). Bizde /takvimim tam bunu yapıyordu ama menü ve sınav
  sohbeti menüsü çalışma planının tamamına gidiyordu (30 Eylül 2026).
*/
describe("Takvimim bağlantıları", () => {
  // 13 Kasım 2026 (Faz 2): Takvimim kabuğun menüsünden profil paneline taşındı (profile-identity.tsx).
  it.each(["src/components/parity/profile-identity.tsx", "src/components/parity/exam-chat-menu.tsx"])(
    "%s takvim sayfasına gider",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("/calisma-plani?tab=takvim");
      expect(source).toContain('"/takvimim"');
    },
  );
});
