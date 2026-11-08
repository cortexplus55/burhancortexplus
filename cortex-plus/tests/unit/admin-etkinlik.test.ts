import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deviceLabel,
  isUserAction,
  mergeEvents,
  nodeKindLabel,
  parseCategory,
  parseWindow,
  paymentText,
  scoreText,
  summarize,
  type ActivityEvent,
} from "@/lib/admin/activity-feed";

/* Yönetim · Kullanıcı Etkinlikleri (8 Kasım 2026, ürün sahibinin isteği). */
const ev = (key: string, at: string, userId: string, category: ActivityEvent["category"], label = "x"): ActivityEvent => ({
  key,
  at,
  userId,
  category,
  label,
});

describe("etkinlik akışı", () => {
  it("en yeni üstte, aynı anahtar bir kez, sınırla kesilir", () => {
    const merged = mergeEvents(
      [
        [ev("a", "2026-11-08T10:00:00Z", "u1", "giris"), ev("b", "2026-11-08T12:00:00Z", "u1", "calisma")],
        [ev("a", "2026-11-08T10:00:00Z", "u1", "giris"), ev("c", "2026-11-07T09:00:00Z", "u2", "belge")],
      ],
      2,
    );
    expect(merged.map((e) => e.key)).toEqual(["b", "a"]);
  });

  it("özet: aktif kullanıcı, giriş, biten etkinlik, ödeme ve en hareketliler", () => {
    const summary = summarize([
      ev("login:1", "2026-11-08T08:00:00Z", "u1", "giris"),
      ev("done:9", "2026-11-08T09:00:00Z", "u1", "calisma"),
      ev("start:9", "2026-11-08T08:30:00Z", "u1", "calisma"),
      ev("pay:3", "2026-11-08T07:00:00Z", "u2", "odeme", "Plus · ödedi · 599 ₺"),
      ev("ai:4", "2026-11-08T07:30:00Z", "u2", "yapay-zeka"),
    ]);
    expect(summary).toMatchObject({ activeUsers: 2, logins: 1, completed: 1, aiActions: 1, paid: 1 });
    expect(summary.topUsers[0]).toMatchObject({ userId: "u1", events: 3, lastAt: "2026-11-08T09:00:00Z" });
  });

  it("ham değer gösterilmez: cihaz, işlem kodu, adım türü, ödeme okunur", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17.0 Mobile Safari/604.1")).toBe("iPhone/iPad · Safari");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36")).toBe("Windows · Chrome");
    expect(deviceLabel(null)).toBe("Bilinmeyen cihaz");
    expect(isUserAction("CHAT_MESSAGE")).toBe(true);
    expect(isUserAction("LESSON_PREFETCH")).toBe(false);
    expect(nodeKindLabel("quiz")).toBe("Konu testi");
    expect(nodeKindLabel("bilinmeyen")).toBe("Etkinlik");
    expect(scoreText(4, 5)).toBe("4/5 · %80");
    expect(scoreText(null, 5)).toBeNull();
    expect(paymentText("paid", 59900, "Plus")).toBe("Plus · ödedi · 599 ₺");
  });

  it("süzgeçler bilinmeyen değerde varsayılana döner", () => {
    expect(parseWindow("30")).toBe(30);
    expect(parseWindow("99")).toBe(7);
    expect(parseCategory("odeme")).toBe("odeme");
    expect(parseCategory("x")).toBeNull();
  });

  it("sayfa menüde, kullanıcı sayfasından bağlanır, yönetici yetkisi ister, içerik okumaz", () => {
    expect(readFileSync("src/lib/admin/nav.ts", "utf8")).toContain('href: "/admin/etkinlik"');
    expect(readFileSync("src/app/admin/kullanicilar/[userId]/page.tsx", "utf8")).toContain("/admin/etkinlik?kim=");
    const page = readFileSync("src/app/admin/etkinlik/page.tsx", "utf8");
    expect(page).toContain("await requireAdminPage();");
    const load = readFileSync("src/lib/admin/activity-load.ts", "utf8");
    // Mesaj ve belge içeriği seçilmez.
    expect(load).not.toMatch(/from\("messages"\)/);
    expect(load).not.toMatch(/select\("[^"]*\b(content|message|text_content)\b/);
  });
});
