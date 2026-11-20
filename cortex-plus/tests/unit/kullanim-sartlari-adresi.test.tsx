/** "/kullanim-sartlari" (19 Kasım 2026, Faz 3): 200 döner, aynı metni çizer, kanonik adres tek. */
import { describe, expect, it } from "vitest";
import KullanimSartlari, { metadata } from "@/app/kullanim-sartlari/page";
import KullanimKosullari from "@/app/kullanim-kosullari/page";

describe("/kullanim-sartlari", () => {
  it("aynı bileşen, kanonik adres eski adres", () => {
    expect(KullanimSartlari).toBe(KullanimKosullari);
    expect(metadata.alternates.canonical).toBe("/kullanim-kosullari");
  });
});
