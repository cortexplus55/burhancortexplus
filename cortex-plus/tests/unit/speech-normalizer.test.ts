import { describe, expect, it } from "vitest";
import { splitDisplaySpoken, toDisplay } from "@/lib/learning/speech-normalizer";

describe("speech normalizer", () => {

  it("eski kayıttan ekran simgesini kurar, ses metnini olduğu gibi bırakır", () => {
    const line = splitDisplaySpoken("Mol, 6,02 × 10 kare küp tanecik ve C O iki.");
    expect(line.text).toContain("10²³");
    expect(line.text).toContain("CO₂");
    expect(line.text).not.toMatch(/kare küp/);
    expect(line.spoken).toContain("10 kare küp");
    expect(line.spoken).toContain("C O iki");
  });

  it("yeni satırda spoken alanı sese gider, ekran simgede kalır", () => {
    const line = splitDisplaySpoken("CO₂ ve 10²³", "C O iki ve on üzeri yirmi üç");
    expect(line.text).toContain("CO₂");
    expect(line.text).toContain("10²³");
    expect(line.spoken).toBe("C O iki ve on üzeri yirmi üç");
  });

  it("9. sınıf sıra sayısını ondalığa çevirmez", () => {
    expect(toDisplay("9. sınıf")).toBe("9. sınıf");
  });
});
