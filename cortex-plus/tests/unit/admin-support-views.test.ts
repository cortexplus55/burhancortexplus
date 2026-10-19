import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  19 Ekim 2026, satışa hazırlık plan 4.2 ve 4.5: destek için kullanıcı ayrıntı sayfası ve salt okunur
  hazırlık görünümü; etkin aboneliği elle uzatma. İçerik (ders metni, cevaplar, belge) gösterilmez,
  hazırlık görünümünün açılışı ve uzatma denetim günlüğüne yazılır.
*/
const user = readFileSync("src/app/admin/kullanicilar/[userId]/page.tsx", "utf8");
const prep = readFileSync("src/app/admin/kullanicilar/[userId]/hazirlik/[prepId]/page.tsx", "utf8");
const actions = readFileSync("src/app/admin/actions.ts", "utf8");

describe("destek görünümleri", () => {
  it("ikisi de yönetici ister, Suspense sınırı yok", () => {
    expect(user).toContain("await requireAdmin()");
    expect(prep).toContain("await requireAdmin()");
    expect(user).toContain('export const dynamic = "force-dynamic"');
    expect(prep).toContain('export const dynamic = "force-dynamic"');
  });

  it("hazırlık görünümü içerik okumaz, açılışı denetime yazar, başkasının hazırlığını açmaz", () => {
    expect(prep).toContain('action: "support.prep_viewed"');
    expect(prep).toContain('.eq("user_id", userId)');
    // Okunan kolonlar: her `.select("…")` çağrısının ilk dizgisi.
    const selected = prep
      .split(".select(")
      .slice(1)
      .map((part) => part.split(")")[0] ?? "")
      .join(" ");
    for (const content of ["payload", "content_json", "answers", "text_content", "clean_text"]) {
      expect(selected, content).not.toContain(content);
    }
  });

  it("abonelik uzatma: yalnız etkin abonelik, 1-365 gün, denetimde önce/sonra", () => {
    expect(actions).toContain("export async function extendSubscription(");
    expect(actions).toContain("z.number().int().min(1).max(365)");
    expect(actions).toContain('.eq("status", "active")');
    expect(actions).toContain('action: "subscription.extended"');
    expect(actions).toMatch(/metadata: \{ subscriptionId: sub\.id, days, before, after \}/);
  });
});
