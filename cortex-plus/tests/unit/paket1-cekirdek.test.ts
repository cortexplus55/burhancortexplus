import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/*
  Paket 1 çekirdeği (6 Kasım 2026, 360° denetim P0):
  - E-posta şablonları kullanıcı adını ve hazırlık başlığını kaçışla basar; addan bağlantı kurulamaz.
  - Analitiğe giden adreslerde belirteç ve kod kalmaz.
  - Kaynak hatası ekranının düğmesi var olan sayfaya gider.
  - Sohbet, sahibi olmadığı hazırlığın belgelerini okumaz; belge listesi yalnız sahibin belgeleri.
*/

vi.mock("server-only", () => ({}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("e-posta kaçışı", async () => {
  const { escapeHtml, personName, safeAppHref } = await import("@/lib/email/escape");

  it("HTML özel karakterleri kaçar", () => {
    expect(escapeHtml(`<a href="https://evil">DOĞRULA</a>`)).toBe("&lt;a href=&quot;https://evil&quot;&gt;DOĞRULA&lt;/a&gt;");
    expect(escapeHtml("Ali & 'Veli'")).toBe("Ali &amp; &#39;Veli&#39;");
  });

  it("kişi adından alan adı, bağlantı ve etiket parçaları düşer; Türkçe harfler kalır", () => {
    expect(personName("Çağrı Öztürk")).toBe("Çağrı Öztürk");
    expect(personName("<a/href=https://evil.com>DOĞRULA</a>", 1)).not.toMatch(/[.:/<>]/);
    expect(personName("www.evil.com", 1)).toBe("www");
    expect(personName("Ayşe evil.com tıkla buraya", 3)).toBe("Ayşe evil com");
    expect(personName("Zeynep O'Neil-Kaya")).toBe("Zeynep O'Neil-Kaya");
    expect(personName("x".repeat(80)).length).toBeLessThanOrEqual(40);
  });

  it("bağlantı yalnız uygulamanın adresiyse kalır", () => {
    expect(safeAppHref("https://cortexplus.app/deneme-sinavlari/1", "https://cortexplus.app")).toBe("https://cortexplus.app/deneme-sinavlari/1");
    expect(safeAppHref("https://evil.com/x", "https://cortexplus.app")).toBe("https://cortexplus.app");
    expect(safeAppHref("javascript:alert(1)", "https://cortexplus.app")).toBe("https://cortexplus.app");
  });

  it("doğrulama, veli ve hatırlatma şablonları dinamik değeri kaçışla basar", () => {
    const mailer = read("src/lib/email/mailer.ts");
    expect(mailer).toContain("${escapeHtml(title)}");
    expect(mailer).toContain("${escapeHtml(cta.href)}");
    expect(mailer).toContain("${escapeHtml(hello)}");
    expect(mailer).toContain("${escapeHtml(who)}");
    expect(mailer).not.toMatch(/<strong>\$\{parentName\}<\/strong>/);
    expect(mailer).not.toMatch(/name\.split\(/);
    const reminder = read("src/app/api/cron/study-reminders/route.ts");
    expect(reminder).toContain("${escapeHtml(row.body)}");
  });
});

describe("analitik adres temizliği", async () => {
  const { scrubPath, scrubUrl, sanitizeAnalyticsProperties } = await import("@/lib/analytics/scrub");

  it("belirteçli yollar ve kimlikler yer tutucuya, sorgu ve parça düşer", () => {
    expect(scrubPath("/odeme/veli/veli.abc.plus.123.nonce.sig")).toBe("/odeme/veli/:token");
    expect(scrubPath("/yukle/kisa")).toBe("/yukle/:token");
    expect(scrubPath("/hazirlik-davet/sinif.x.y.z")).toBe("/hazirlik-davet/:token");
    expect(scrubPath("/deneme-sinavlari/0b2a6a7e-8d2c-4b6a-9f1e-3c4d5e6f7a8b/dugum/0b2a6a7e-8d2c-4b6a-9f1e-3c4d5e6f7a8b"))
      .toBe("/deneme-sinavlari/:id/dugum/:id");
    expect(scrubPath("/pay?kod=BETA-ABCD-EFGH")).toBe("/pay");
    expect(scrubPath("/fiyatlandirma")).toBe("/fiyatlandirma");
    expect(scrubUrl("https://cortexplus.app/kayit?ref=ABC123#x")).toBe("https://cortexplus.app/kayit");
  });

  it("olay özelliklerinde adres alanları temizlenir, öbürleri dokunulmaz", () => {
    const out = sanitizeAnalyticsProperties({
      $current_url: "https://cortexplus.app/odeme/veli/gizli.belirtec.burada?x=1",
      $referrer: "https://instagram.com/?igsh=abc",
      plan: "plus-aylik",
      $set: { $initial_current_url: "https://cortexplus.app/pay?kod=BETA-1234-5678" },
    });
    expect(out.$current_url).toBe("https://cortexplus.app/odeme/veli/:token");
    expect(out.$referrer).toBe("https://instagram.com/");
    expect(out.plan).toBe("plus-aylik");
    expect((out.$set as Record<string, unknown>).$initial_current_url).toBe("https://cortexplus.app/pay");
  });

  it("PostHog otomatik yakalama ve oturum kaydı kapalı, before_send bağlı", () => {
    const analytics = read("src/components/analytics.tsx");
    expect(analytics).toMatch(/autocapture:\s*false/);
    expect(analytics).toMatch(/disable_session_recording:\s*true/);
    expect(analytics).toMatch(/before_send:/);
    expect(analytics).toMatch(/scrubPath\(pathname/);
  });
});

describe("kaynak hatası ekranı", () => {
  it("/belgeler bağlantısı kalmadı; eski adres yönlendirilir", () => {
    expect(read("src/lib/learning/generation-failure.ts")).not.toContain('"/belgeler"');
    expect(read("next.config.ts")).toMatch(/source:\s*"\/belgeler",\s*destination:\s*"\/dokumanlar"/);
  });
});

describe("sohbet ve belge listesi sahipliği", async () => {
  const { ownedByPrepOwner } = await import("@/lib/documents/teacher-analysis-run");

  function fakeService(owned: Record<string, string>) {
    return {
      from: () => {
        const filters: { ids: string[]; user: string | null } = { ids: [], user: null };
        const chain = {
          select: () => chain,
          in: (_column: string, ids: string[]) => {
            filters.ids = ids;
            return chain;
          },
          eq: (_column: string, user: string) => {
            filters.user = user;
            return Promise.resolve({ data: filters.ids.filter((id) => owned[id] === filters.user).map((id) => ({ id })), error: null });
          },
        };
        return chain;
      },
    } as never;
  }

  it("başka öğrencinin belgesi hazırlığa yazılmış olsa da listeden düşer; sıra korunur", async () => {
    const service = fakeService({ a: "owner", b: "victim", c: "owner" });
    expect(await ownedByPrepOwner(service, "owner", ["c", "b", "a"])).toEqual(["c", "a"]);
  });

  it("sahibi bilinmeyen hazırlık hiç belge döndürmez", async () => {
    expect(await ownedByPrepOwner(fakeService({ a: "owner" }), null, ["a"])).toEqual([]);
  });

  it("çok sayıda belge dilim dilim süzülür", async () => {
    const ids = Array.from({ length: 400 }, (_, i) => `d${i}`);
    const owned = Object.fromEntries(ids.map((id) => [id, "owner"]));
    expect(await ownedByPrepOwner(fakeService(owned), "owner", ids)).toHaveLength(400);
  });

  it("sohbet rotası hazırlık sahipliğini bağlam okumalarından önce denetler", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    const check = route.indexOf('.from("exam_preps").select("id").eq("id", rest.prepId).eq("user_id", userId)');
    const grounding = route.indexOf("loadPrepChatGrounding(service, userId, rest.prepId");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(grounding);
    expect(route).toContain('errorResponse(404, "prep_not_found")');
  });

  it("belge listesi ve çıkmış soru okuyucusu sahibe göre süzer", () => {
    expect(read("src/lib/documents/teacher-analysis-run.ts")).toMatch(/return ownedByPrepOwner\(service, ownerId,/);
    // Çıkmış soru okuyucusu artık hazırlığın tek belge listesini (yukarıdaki, sahibe süzülmüş) kullanır.
    expect(read("src/lib/learning/mock-exam/create.ts")).toMatch(/const ids = await loadPrepDocumentIds\(service, prepId\)/);
  });
});
