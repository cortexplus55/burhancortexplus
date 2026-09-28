import { describe, expect, it } from "vitest";
import {
  isLearnerVerificationNote,
  stripLearnerVerificationChrome,
} from "@/lib/learning/learner-verification-chrome";

describe("stripLearnerVerificationChrome", () => {
  it("Kaynak: satırını dosya noktasında kesmeden siler", () => {
    expect(
      stripLearnerVerificationChrome(
        "Mol oranı korunur. Kaynak: kimya.pdf, s.4 Sonraki adım hızdır.",
      ),
    ).toBe("Mol oranı korunur. Sonraki adım hızdır.");
    expect(
      stripLearnerVerificationChrome("Özet burada. Kaynak: fizik.pdf, s.12"),
    ).toBe("Özet burada.");
  });

  it("çok kelimeli Kaynak: adını tümüyle siler", () => {
    expect(
      stripLearnerVerificationChrome(
        "Mol korunur. Kaynak: Organik Kimya Ders Notları.pdf, s.4 Sonraki adımdır.",
      ),
    ).toBe("Mol korunur. Sonraki adımdır.");
  });

  it("belirli meta notları siler; gerçek öğretim cümleleri kalır", () => {
    expect(
      stripLearnerVerificationChrome(
        "Doğrulanamayan cümleler çıkarıldı. Enerji kaynağı güneştir.",
      ),
    ).toBe("Enerji kaynağı güneştir.");
    expect(
      stripLearnerVerificationChrome("Reaksiyonda su buharı çıkarıldı."),
    ).toBe("Reaksiyonda su buharı çıkarıldı.");
    expect(
      stripLearnerVerificationChrome("Bu enerji kaynağı yenilenebilir."),
    ).toBe("Bu enerji kaynağı yenilenebilir.");
  });

  it("isLearnerVerificationNote yalnız meta kalıpları yakalar", () => {
    expect(
      isLearnerVerificationNote({
        title: "Not",
        body: "Bazı hesap adımları kaynakla doğrulanamadığı için çıkarıldı.",
      }),
    ).toBe(true);
    expect(
      isLearnerVerificationNote({
        title: "İpucu",
        body: "Su buharı ortamdan çıkarıldı.",
      }),
    ).toBe(false);
  });
});
