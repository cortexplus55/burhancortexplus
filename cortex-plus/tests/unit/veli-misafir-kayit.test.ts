import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { PARENT_WHATSAPP_GUEST_HREF } from "@/lib/payments/parent-whatsapp-copy";

/**
 * 20 Kasım 2026 canlı bağlantı taraması: fiyat sayfasındaki "Velime WhatsApp'tan Ödeme Linki Gönder" misafiri giriş
 * ekranına ("Tekrar hoş geldin") götürüyordu. Öbür misafir satın alma düğmeleri gibi kayda gider; kayıttan sonra
 * veli paneli açık gelir.
 */
describe("velime ödeme linki · misafir", () => {
  it("misafir düğmesi kayda gider ve dönüş adresi veli paneli", () => {
    const url = new URL(PARENT_WHATSAPP_GUEST_HREF, "https://cortexplus.app");
    expect(url.pathname).toBe("/kayit");
    const next = url.searchParams.get("next");
    expect(next).toBe("/pay?veli=1");
    expect(safeNextPath(next, "")).toBe("/pay?veli=1");
  });
});
