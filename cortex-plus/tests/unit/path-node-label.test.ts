import { describe, expect, it } from "vitest";
import { pathNodeLabel } from "@/components/parity/exam-prep-home";

describe("pathNodeLabel", () => {
  it("bölüm başlığıyla aynı konuyu tekrar etmez", () => {
    expect(pathNodeLabel("Mantığa Giriş", "Konu testi", "Mantığa Giriş · Mantık ve doğru düşünme")).toBe("Konu testi");
    expect(pathNodeLabel("mantığa giriş", "Giriş Dersi", "Mantığa Giriş")).toBe("Giriş Dersi");
  });
  it("farklı konu ya da bölümsüz düğümde konu adı kalır", () => {
    expect(pathNodeLabel("Klasik Mantık", "Konu testi", "Mantığa Giriş")).toBe("Klasik Mantık · Konu testi");
    expect(pathNodeLabel("Klasik Mantık", "Konu testi", null)).toBe("Klasik Mantık · Konu testi");
  });
  it("başlık türle aynıysa tekrarlamaz", () => {
    expect(pathNodeLabel("Konu testi", "Konu testi", null)).toBe("Konu testi");
  });
});
