import { describe, expect, it } from "vitest";
import { topicOnlyLabel, withoutOutcomeCode } from "@/lib/learning/path-labels";
import { nodeHeading } from "@/lib/learning/node-heading";

/*
  8 Kasım 2026 (ücretsiz hesap turu): hazır müfredattan kurulan hazırlıkta yol başlıkları, "Sıradaki" kartı ve
  Sınavlar kartı ham MEB kazanım koduyla başlıyordu ("T.O.5.5 Metinde geçen …"). Kod yalnız görünümde atılır.
*/
describe("kazanım kodu öğrenciye gösterilmez", () => {
  it("baştaki kod atılır; sınıf, kısaltma ve tarih dokunulmaz", () => {
    expect(withoutOutcomeCode("T.O.5.5 Metinde geçen anlam")).toBe("Metinde geçen anlam");
    expect(withoutOutcomeCode("M.5.1.2.3 Doğal sayılar")).toBe("Doğal sayılar");
    expect(withoutOutcomeCode("F.5.1.1. Güneş")).toBe("Güneş");
    for (const keep of ["9. Sınıf", "T.C. Anayasası", "M.Ö. 3000 yılları", "TYT Matematik", "T.O.5.5"]) {
      expect(withoutOutcomeCode(keep)).toBe(keep);
    }
  });

  it("yol başlığı ve adım adı aynı temizliği kullanır", () => {
    expect(topicOnlyLabel("5. Sınıf · T.O.5.5 Metinde geçen anlam")).toBe("Metinde geçen anlam");
    expect(nodeHeading({ kind: "lesson", title: "Giriş Dersi", sessionMeta: { topicTitle: "T.O.5.6 Ana fikir" } })).toBe("Ana fikir");
    expect(nodeHeading({ kind: "quiz", title: "T.O.5.7 Metin türleri" })).toBe("Metin türleri");
  });
});
