import { describe, expect, it } from "vitest";
import { dedupePathLabels } from "@/lib/learning/path-labels";

describe("ders sonu Sıradaki adım listesi", () => {
  it("ortak sınıf ön ekini bir kez yazar", () => {
    expect(dedupePathLabels(["9. Sınıf · Kümeler", "9. Sınıf · Üçgenler"])).toEqual({ prefix: "9. Sınıf", items: ["Kümeler", "Üçgenler"] });
  });
  it("karışık ön ekte listeyi olduğu gibi bırakır", () => {
    expect(dedupePathLabels(["9. Sınıf · Veri", "10. Sınıf · Polinomlar"]).prefix).toBeNull();
  });
});
