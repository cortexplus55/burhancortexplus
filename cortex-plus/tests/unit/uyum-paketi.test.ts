import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/*
  Uyum paketi (7 Kasım 2026). Ürün sahibinin isteği: KVKK metni görünür olsun, açılıp sonuna kadar okunmadan kutu
  işaretlenmesin, onay saklansın, aynı sürümü onaylamış kullanıcıya bir daha sorulmasın; profesyonel sitelerin
  yaptığı gibi. Paket ayrıca çerez bandı ve politikası, yaş beyanı ve veli izni, ödemede ayrı "hemen başlasın"
  onayı (m.15/1-h), iade e-postası, destek konu türleri ve sözleşme örneğini kapsar.
*/

vi.mock("server-only", () => ({}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

describe("metin sürümleri: metin değişince sürüm de değişir", async () => {
  const { LEGAL_VERSIONS, SALES_DOCS, COOKIE_POLICY_VERSION, REQUIRED_CONSENT_KEY, AGE_DECLARATION } = await import(
    "@/lib/legal/versions"
  );
  const { KVKK_SECTIONS, KVKK_SUMMARY } = await import("@/lib/legal/kvkk-text");
  const { TERMS_SECTIONS } = await import("@/lib/legal/terms-text");
  const { COOKIE_ROWS, COOKIE_SECTIONS } = await import("@/lib/legal/cookie-text");
  const { DISTANCE_SALES_SECTIONS, PRE_INFO_SECTIONS, PERFORMANCE_CONSENT_TEXT } = await import("@/lib/legal/texts");

  /*
    Her sürümün metin özeti. Metni değiştiren yeni bir sürüm tarihi ekler ve özetini buraya yazar; eski satırlar
    kalır (git geçmişi "o gün ne yazıyordu" sorusunu cevaplar). Özet tutmuyorsa ya metin sürümsüz değişti ya da sürüm
    değişip buraya eklenmedi.
  */
  const FINGERPRINTS = {
    kvkk: { "2026-11-07": "9446ec8ca66fe40e" } as Record<string, string>,
    terms: { "2026-11-07": "65eb7f7261e5a0c4" } as Record<string, string>,
    cookie: { "2026-11-07": "6942f7aaf4fcbb7f" } as Record<string, string>,
    sales: { "2026-11-07": "b97ee8662442fa45" } as Record<string, string>,
  };

  it("her metnin bugünkü özeti kendi sürümüne kayıtlı", () => {
    expect(fingerprint({ KVKK_SUMMARY, KVKK_SECTIONS })).toBe(FINGERPRINTS.kvkk[LEGAL_VERSIONS.kvkk_aydinlatma]);
    expect(fingerprint(TERMS_SECTIONS)).toBe(FINGERPRINTS.terms[LEGAL_VERSIONS.kullanim_kosullari]);
    expect(fingerprint({ COOKIE_ROWS, COOKIE_SECTIONS })).toBe(FINGERPRINTS.cookie[COOKIE_POLICY_VERSION]);
    expect(fingerprint({ PRE_INFO_SECTIONS, DISTANCE_SALES_SECTIONS, PERFORMANCE_CONSENT_TEXT })).toBe(
      FINGERPRINTS.sales[SALES_DOCS.version],
    );
  });

  it("onay kapısının kimliği istenen bütün sürümleri taşır", () => {
    expect(REQUIRED_CONSENT_KEY).toContain(`kvkk_aydinlatma@${LEGAL_VERSIONS.kvkk_aydinlatma}`);
    expect(REQUIRED_CONSENT_KEY).toContain(`kullanim_kosullari@${LEGAL_VERSIONS.kullanim_kosullari}`);
    expect(REQUIRED_CONSENT_KEY).toContain(`${AGE_DECLARATION.type}@${AGE_DECLARATION.version}`);
  });
});

describe("okuma kanıtı ve onay durumu (saf kurallar)", async () => {
  const { validReadEvidence, ageProblem, consentStatusFrom } = await import("@/lib/legal/consent-evidence");
  const now = new Date("2026-11-07T12:00:00Z");
  const good = { version: "2026-11-07", openedAt: "2026-11-07T11:58:00Z", confirmedAt: "2026-11-07T11:59:30Z", scrolledToEnd: true };

  it("geçerli kanıt: bugünkü sürüm, sonuna kadar kaydırılmış, açılış ≤ onay ≤ şimdi, son bir hafta", () => {
    expect(validReadEvidence(good, "2026-11-07", now)).toBe(true);
    expect(validReadEvidence({ ...good, version: "2026-08-27" }, "2026-11-07", now)).toBe(false);
    expect(validReadEvidence({ ...good, scrolledToEnd: false }, "2026-11-07", now)).toBe(false);
    expect(validReadEvidence({ ...good, openedAt: "2026-11-07T12:00:00Z" }, "2026-11-07", now)).toBe(false);
    expect(validReadEvidence({ ...good, confirmedAt: "2026-11-07T12:30:00Z" }, "2026-11-07", now)).toBe(false);
    expect(validReadEvidence({ ...good, openedAt: "2026-10-01T10:00:00Z", confirmedAt: "2026-10-01T10:01:00Z" }, "2026-11-07", now)).toBe(false);
    expect(validReadEvidence({ ...good, confirmedAt: "dün" }, "2026-11-07", now)).toBe(false);
    expect(validReadEvidence(null, "2026-11-07", now)).toBe(false);
  });

  it("yaş beyanı: seçim zorunlu, 18 altında velinin izni zorunlu", () => {
    expect(ageProblem(null)).toBe("Yaşını seç.");
    expect(ageProblem({ minor: true, guardianAck: false })).toMatch(/velinin iznini/);
    expect(ageProblem({ minor: true, guardianAck: true })).toBeNull();
    expect(ageProblem({ minor: false, guardianAck: false })).toBeNull();
  });

  it("eksik onaylar: sürümü değişen metin önceki sürümüyle, hiç onaylanmamış metin ilk kez; yaş ayrıca", () => {
    const fresh = consentStatusFrom([]);
    expect(fresh.missing.map((item) => [item.type, item.previous])).toEqual([
      ["kvkk_aydinlatma", null],
      ["kullanim_kosullari", null],
    ]);
    expect(fresh.ageNeeded).toBe(true);

    const updated = consentStatusFrom([
      { consent_type: "kvkk_aydinlatma", version: "2026-08-27" },
      { consent_type: "kullanim_kosullari", version: "2026-09-28" },
    ]);
    expect(updated.missing.map((item) => [item.type, item.previous])).toEqual([
      ["kvkk_aydinlatma", "2026-08-27"],
      ["kullanim_kosullari", "2026-09-28"],
    ]);

    const done = consentStatusFrom([
      { consent_type: "kvkk_aydinlatma", version: "2026-11-07" },
      { consent_type: "kullanim_kosullari", version: "2026-11-07" },
      { consent_type: "yas_beyani", version: "2026-11-07" },
      { consent_type: "satis_sozlesmeleri", version: "2026-11-07" },
    ]);
    expect(done.missing).toEqual([]);
    expect(done.ageNeeded).toBe(false);
    expect(done.read).toContain("satis_sozlesmeleri@2026-11-07");
  });
});

describe("onay kaydı: kanıtsız onay bugünkü sürüm adına yazılmaz", async () => {
  const { consentItemsFrom, recordConsents, recordSignupConsent } = await import("@/lib/legal/record-consent");
  const now = new Date("2026-11-07T12:00:00Z");
  const evidence = { version: "2026-11-07", openedAt: "2026-11-07T11:58:00Z", confirmedAt: "2026-11-07T11:59:30Z", scrolledToEnd: true };

  it("yalnız geçerli kanıtı olan metin ve tamamlanmış yaş beyanı satır olur", () => {
    const items = consentItemsFrom(
      {
        acceptedAt: "2026-11-07T11:59:40Z",
        documents: { kvkk_aydinlatma: evidence, kullanim_kosullari: { ...evidence, scrolledToEnd: false } },
        age: { minor: true, guardianAck: true },
      },
      now,
    );
    expect(items.map((item) => item.type)).toEqual(["kvkk_aydinlatma", "yas_beyani"]);
    expect(items[0].evidence).toEqual(evidence);
    expect(items[0].acceptedAt).toBe("2026-11-07T11:59:30.000Z");
    expect(items[1].evidence).toEqual({ minor: true, guardianAck: true });
    expect(consentItemsFrom({ acceptedAt: "2026-11-07T11:59:40Z" }, now)).toEqual([]);
    expect(consentItemsFrom({ acceptedAt: "x", age: { minor: true, guardianAck: false } }, now)).toEqual([]);
  });

  function fakeService(existing: { consent_type: string; version: string }[] = [], insertErrors: unknown[] = []) {
    const inserts: Record<string, unknown>[][] = [];
    const updates: Record<string, unknown>[] = [];
    const service = {
      from: vi.fn((table: string) => ({
        select: () => ({ eq: async () => ({ data: existing, error: null }) }),
        insert: async (rows: Record<string, unknown>[]) => {
          inserts.push(rows);
          return { error: insertErrors.shift() ?? null };
        },
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            updates.push({ table, ...values });
            return { error: null };
          },
        }),
      })),
    };
    return { service: service as never, inserts, updates };
  }

  it("aynı tür@sürüm ikinci kez yazılmaz; kanıt satıra girer", async () => {
    const { service, inserts } = fakeService([{ consent_type: "kvkk_aydinlatma", version: "2026-11-07" }]);
    const result = await recordConsents(service, {
      userId: "u1",
      ip: "203.0.113.7",
      items: [
        { type: "kvkk_aydinlatma", version: "2026-11-07", acceptedAt: "2026-11-07T11:59:30Z", evidence },
        { type: "kullanim_kosullari", version: "2026-11-07", acceptedAt: "2026-11-07T11:59:30Z", evidence },
        { type: "kullanim_kosullari", version: "2026-11-07", acceptedAt: "2026-11-07T11:59:31Z", evidence },
      ],
    });
    expect(result).toEqual({ ok: true, inserted: 1 });
    expect(inserts[0].map((row) => row.consent_type)).toEqual(["kullanim_kosullari"]);
    expect(inserts[0][0].evidence).toEqual(evidence);
    expect(String(inserts[0][0].ip_hash)).not.toContain("203.0.113.7");
  });

  it("göç (evidence sütunu) canlıda yoksa satır kanıtsız yazılır, onay kaybolmaz", async () => {
    const { service, inserts } = fakeService([], [{ code: "PGRST204", message: "Could not find the 'evidence' column" }]);
    const result = await recordConsents(service, {
      userId: "u1",
      items: [{ type: "kvkk_aydinlatma", version: "2026-11-07", acceptedAt: "2026-11-07T11:59:30Z", evidence }],
    });
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(2);
    expect(inserts[1][0]).not.toHaveProperty("evidence");
  });

  it("18 yaşından küçük beyanında ad sıralamada kapalı başlar", async () => {
    const { service, updates } = fakeService();
    await recordSignupConsent(service, {
      userId: "u1",
      acceptedAt: new Date().toISOString(),
      age: { minor: true, guardianAck: true },
    });
    expect(updates).toEqual([{ table: "profiles", stars_hidden: true }]);
  });
});

describe("çerez tercihi", async () => {
  const { parseCookieConsent, serializeCookieConsent, readCookieValue } = await import("@/lib/consent/cookie-consent");
  const { COOKIE_POLICY_VERSION } = await import("@/lib/legal/versions");
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const now = Date.parse("2026-11-07T12:00:00Z");

  it("gidiş-dönüş; sürüm farklı, süresi dolmuş ya da bozuk tercih yeniden sorulur", () => {
    const consent = { v: COOKIE_POLICY_VERSION, a: true, t: now - 1000, id };
    expect(parseCookieConsent(serializeCookieConsent(consent), now)).toEqual(consent);
    expect(parseCookieConsent(serializeCookieConsent({ ...consent, v: "2025-01-01" }), now)).toBeNull();
    expect(parseCookieConsent(serializeCookieConsent({ ...consent, t: now - 400 * 86_400_000 }), now)).toBeNull();
    expect(parseCookieConsent(serializeCookieConsent({ ...consent, id: "abc" }), now)).toBeNull();
    expect(parseCookieConsent("%7Bbozuk", now)).toBeNull();
    expect(parseCookieConsent(null, now)).toBeNull();
    expect(readCookieValue("cp_consent", `a=1; cp_consent=${serializeCookieConsent(consent)}; b=2`)).toBe(
      serializeCookieConsent(consent),
    );
  });

  it("analitik yalnız izinle yüklenir; izin geri alınınca izler silinir", () => {
    const analytics = read("src/components/analytics.tsx");
    expect(analytics).toContain("if (!key || !allowed) return;");
    expect(analytics).toContain("hasAnalyticsConsent()");
    expect(analytics).toContain("opt_out_capturing");
    expect(analytics).toContain("clearAnalyticsStorage()");
    // İzin yoksa önceki sürümün izinsiz bıraktığı PostHog izleri açılışta silinir.
    expect(analytics).toContain("if (!consented) clearAnalyticsStorage();");
  });

  it("bant: üç eşit düğme (Reddet, Tercihler, Kabul et), çerez duvarı yok; tercih her sayfadan değişir", () => {
    const banner = read("src/components/legal/cookie-banner.tsx");
    for (const label of ["Reddet", "Tercihler", "Kabul et"]) expect(banner).toContain(`>\n              ${label}\n`);
    expect(banner.match(/className="cp-cookie-btn"/g)?.length).toBeGreaterThanOrEqual(6);
    const providers = read("src/components/providers.tsx");
    expect(providers).toContain("<CookieBanner />");
    expect(providers).toContain("<ConsentGate />");
    const footer = read("src/components/parity/marketing.tsx");
    expect(footer).toContain('href="/cerez-politikasi"');
    expect(footer).toContain("<CookiePreferencesButton");
    expect(read("src/app/ayarlar/page.tsx")).toContain("<CookiePreferencesButton");
  });

  it("çerez tablosu: her satırın adı, amacı, süresi ve tarafı var; yalnız zorunlu ve analitik", async () => {
    const { COOKIE_ROWS } = await import("@/lib/legal/cookie-text");
    for (const row of COOKIE_ROWS) {
      expect(row.name.length).toBeGreaterThan(2);
      expect(row.purpose.length).toBeGreaterThan(10);
      expect(row.duration.length).toBeGreaterThan(2);
      expect(row.party.length).toBeGreaterThan(5);
      expect(["zorunlu", "analitik"]).toContain(row.category);
    }
    expect(COOKIE_ROWS.filter((row) => row.category === "analitik").map((row) => row.party).join(" ")).toContain("PostHog");
    // Tablo, kodun yazdığı birinci taraf çerezleri anar.
    for (const name of ["cp_device", "cp_focus_prep", "cp_consent", "cp_admin_gate"]) {
      expect(COOKIE_ROWS.some((row) => row.name === name)).toBe(true);
    }
  });
});

describe("aydınlatma metni: Tebliğ'in beş unsuru, çocuk özeti, dürüst aktarım cümlesi", async () => {
  const { KVKK_SECTIONS, KVKK_SUMMARY } = await import("@/lib/legal/kvkk-text");
  const { SELLER } = await import("@/lib/legal/seller");
  const { CROSS_BORDER_SCC_NOTIFIED } = await import("@/lib/legal/compliance-flags");
  const all = [...KVKK_SUMMARY, ...KVKK_SECTIONS.flatMap((section) => [section.heading, ...section.body])].join("\n");

  it("veri sorumlusu, amaç, aktarım, toplama yöntemi ve hukuki sebep, m.11 hakları", () => {
    expect(all).toContain(SELLER.legalName);
    expect(all).toContain(SELLER.email);
    const headings = KVKK_SECTIONS.map((section) => section.heading);
    for (const heading of [
      "Veri sorumlusu",
      "Verileri hangi amaçla işliyoruz",
      "Verileri kimlere aktarıyoruz",
      "Verileri nasıl topluyoruz",
      "Hukuki sebepler",
      "Haklarınız (KVKK m.11)",
      "Nasıl başvurursun",
      "18 yaşından küçük kullanıcılar",
      "Ne kadar saklıyoruz",
    ]) {
      expect(headings).toContain(heading);
    }
    const rights = KVKK_SECTIONS.find((section) => section.heading.startsWith("Haklarınız"))?.body ?? [];
    expect(rights.map((line) => line.split(")")[0])).toEqual(["a", "b", "c", "ç", "d", "e", "f", "g", "ğ"]);
  });

  it("çocuk özeti kısa ve sade; sağlayıcılar ve ülkeleri yazılı; ses kaydı saklanmaz", () => {
    expect(KVKK_SUMMARY.length).toBeLessThanOrEqual(6);
    for (const line of KVKK_SUMMARY) expect(line.length).toBeLessThan(200);
    for (const vendor of ["Supabase", "Vercel", "OpenAI", "PayTR", "PostHog", "Sentry", "Upstash"]) expect(all).toContain(vendor);
    expect(all).toContain("ses kaydı saklanmaz");
    expect(all).toMatch(/30 gün içinde/);
  });

  it("standart sözleşme imzalanıp bildirilmeden metin bunu iddia etmez", () => {
    if (!CROSS_BORDER_SCC_NOTIFIED) {
      expect(all).not.toMatch(/Kurul'a bildiril/);
      expect(all).toContain("veri işleme sözleşmelerine dayanır");
    }
  });
});

describe("kullanım koşulları ve satış metinleri", async () => {
  const { TERMS_SECTIONS } = await import("@/lib/legal/terms-text");
  const { PRE_INFO_SECTIONS, DISTANCE_SALES_SECTIONS, CANCELLATION_SECTIONS, PERFORMANCE_CONSENT_TEXT } = await import(
    "@/lib/legal/texts"
  );
  const terms = TERMS_SECTIONS.flatMap((section) => [section.heading, ...section.body]).join("\n");
  const sales = [...PRE_INFO_SECTIONS, ...DISTANCE_SALES_SECTIONS, ...CANCELLATION_SECTIONS]
    .flatMap((section) => [section.heading, ...section.body])
    .join("\n");

  it("yaş ve veli izni, yüklenen içerik, sıralama ve değişiklik maddesi var; tutulmayan söz yok", () => {
    for (const heading of ["18 yaşından küçük kullanıcılar", "Yüklediğin içerik", "Yıldızlar ve sıralama", "Değişiklikler"]) {
      expect(TERMS_SECTIONS.map((section) => section.heading)).toContain(heading);
    }
    // 19 Ekim 2026'dan beri öğrenci kredi sayısı görmüyor: eski cümle tutulamayan bir sözdü.
    expect(terms).not.toMatch(/Kredi bedelleri işlem öncesinde gösterilir/);
    expect(terms).toContain("(ğ) ve (h)");
  });

  it("cayma istisnası (ğ) ve (h) bentlerine dayanır; hemen başlama ayrı kutuyla; örnek e-postayla", () => {
    expect(sales).toContain("(h) bendi");
    expect(sales).toContain("ayrı bir kutuyla");
    expect(PERFORMANCE_CONSENT_TEXT).toMatch(/hemen başlamasını istiyorum/);
    expect(sales).toContain("hesabın e-posta adresine gönderilir");
    expect(sales).toContain("İade talebi nasıl işler");
  });
});

describe("ödeme: iki onay sunucuda da zorunlu", () => {
  it("öğrencinin ve velinin ödemesi hemen başlama onayı olmadan başlamaz", () => {
    for (const route of [
      "src/app/api/payments/paytr/create-token/route.ts",
      "src/app/api/payments/parent-link/checkout/route.ts",
    ]) {
      const source = read(route);
      expect(source).toContain("performanceConsent: z.literal(true)");
      expect(source).toContain("performance_consent_required");
    }
    for (const client of ["src/components/parity/subscription-cards.tsx", "src/components/billing/parent-pay-form.tsx"]) {
      const source = read(client);
      expect(source).toContain("performanceConsent: true");
      expect(source).toContain('docId="satis_sozlesmeleri"');
      expect(source).toContain("PERFORMANCE_CONSENT_TEXT");
    }
    const shell = read("src/lib/payments/checkout.ts");
    expect(shell).toContain("performance_consent: {");
    expect(shell).toContain("text: PERFORMANCE_CONSENT_TEXT");
  });

  it("sözleşme örneği: ödeme kesinleşince e-posta, Ödemelerim'de sayfa, veliye ödemeye geçerken", async () => {
    expect(read("src/app/api/payments/paytr/callback/route.ts")).toContain("sendPurchaseContract(service, merchantOid");
    expect(read("src/app/api/payments/parent-link/checkout/route.ts")).toContain("sendParentContractCopy(");
    expect(read("src/app/odemeler/page.tsx")).toContain("/odemeler/sozlesme/");
    const { purchaseContractSections } = await import("@/lib/payments/purchase-contract");
    const sections = purchaseContractSections({ merchantOid: "CP1", planName: "Plus", amountKurus: 59900, at: "2026-11-07T09:00:00Z" });
    expect(sections[0].heading).toBe("Satın alma bilgileri");
    expect(sections[0].body.join(" ")).toMatch(/CP1.*Plus.*599/);
    expect(sections.some((section) => section.heading.startsWith("Mesafeli Satış Sözleşmesi ·"))).toBe(true);
  });
});

describe("kayıt ve onay kapısı", async () => {
  const { consentGateExempt } = await import("@/components/legal/consent-gate");
  const { hasSessionCookie, sessionFingerprint } = await import("@/lib/consent/session-cookie");

  it("kayıtta iki ayrı okumalı kutu ve yaş beyanı; eski tek kutu yok", () => {
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard).toContain('docId="kvkk_aydinlatma"');
    expect(wizard).toContain('docId="kullanim_kosullari"');
    expect(wizard).toContain("<AgeDeclarationField");
    expect(wizard).not.toContain("setConsent(");
    expect(wizard).toContain("consentEvidence: payload.consentEvidence");
    const route = read("src/app/api/auth/signup/route.ts");
    expect(route).toContain("await recordSignupConsent(service, {");
  });

  it("kapı metin sayfalarında, giriş/kayıt akışında ve ödeme dönüşünde açılmaz; uygulamada açılır", () => {
    for (const path of ["/kvkk", "/kullanim-kosullari", "/cerez-politikasi", "/kayit/tamamla", "/giris", "/onboarding", "/odeme/basarili", "/e2e/paket-j"]) {
      expect(consentGateExempt(path)).toBe(true);
    }
    for (const path of ["/ogretmen", "/deneme-sinavlari", "/pay", "/admin", "/kvkkx"]) expect(consentGateExempt(path)).toBe(false);
    expect(consentGateExempt(null)).toBe(true);
  });

  it("oturum çerezi (parçalı adlar dahil) tanınır; parmak izi oturuma göre değişir", () => {
    expect(hasSessionCookie("a=1; sb-dgjfyewgrukglsehyntc-auth-token.0=base64-abc; b=2")).toBe(true);
    expect(hasSessionCookie("sb-dgjfyewgrukglsehyntc-auth-token=x")).toBe(true);
    expect(hasSessionCookie("cp_consent=1; theme=dark")).toBe(false);
    expect(sessionFingerprint("sb-x-auth-token=aaa")).not.toBe(sessionFingerprint("sb-x-auth-token=bbb"));
    expect(sessionFingerprint("sb-x-auth-token=aaa; cp_consent=1")).toBe(sessionFingerprint("cp_consent=2; sb-x-auth-token=aaa"));
  });
});

describe("destek konu türü", async () => {
  const { categorizedSubject, isSupportCategory } = await import("@/lib/support/categories");

  it("konu türü konunun önüne bir kez yazılır, 150 karaktere sığar", () => {
    expect(categorizedSubject("odeme", "İade istiyorum")).toBe("[Ödeme ve iade] İade istiyorum");
    expect(categorizedSubject("odeme", "[Ödeme ve iade] İade istiyorum")).toBe("[Ödeme ve iade] İade istiyorum");
    expect(categorizedSubject("genel", "Soru")).toBe("Soru");
    expect(categorizedSubject(undefined, "Soru")).toBe("Soru");
    expect(categorizedSubject("kvkk", "x".repeat(200)).length).toBe(150);
    expect(isSupportCategory("kvkk")).toBe(true);
    expect(isSupportCategory("başka")).toBe(false);
  });
});

describe("göç ve hesap silme", () => {
  it("göç yalnız ekler; tarayıcı yazamaz", () => {
    const sql = read("supabase/migrations/20261107120000_uyum_paketi.sql");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS evidence jsonb");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.cookie_consent_events FROM anon, authenticated");
    expect(sql).not.toMatch(/DROP\s+(TABLE|POLICY|COLUMN)/i);
  });

  it("hesap silinince çerez tercihi kayıtları da gider", () => {
    const source = read("src/lib/privacy/account-deletion.ts");
    expect(source.match(/"cookie_consent_events"/g)?.length).toBe(2);
  });
});
