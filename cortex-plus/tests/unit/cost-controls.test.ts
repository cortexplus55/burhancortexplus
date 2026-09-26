import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { selectModel } from "@/lib/ai/model-router";
import {
  HARD_UPGRADE_MONTHLY_LIMIT,
  claimHardUpgrade,
} from "@/lib/ai/model-upgrade";
import {
  FREE_IMAGE_DAILY_LIMIT,
  freeImageAllowed,
} from "@/lib/ai/image-quota";

/*
  18 Eylül 2026'da birlikte gelen üç maliyet freni: deneme üretiminin fiyatı,
  zor soru yükseltmesinin aylık tavanı ve ücretsiz hesabın günlük fotoğraf
  tavanı. Üçü de aynı soruya cevap veriyor — "bu işin bedelini kim ödüyor".

  Zor soru yükseltmesi, KREDİSİ ARTMADAN gpt-4o'ya çıkan tek dal: öğrenci
  1 kredi ödüyor, aradaki farkı biz ödüyoruz. Bilerek böyle — modeli seçen
  taraf biz olduğumuza göre bedeli de bizim.

  Eksik olan tavandı. Zorluğu sunucu ölçüyor ama ölçüm GİRDİYİ okuyor:
  matematik gösterimi, çok parçalı soru, "neden" soruları. Hep bu biçimde
  yazan bir hesabın her mesajı yükseliyordu ve Plus'ın 400 kredisinin tamamı
  gpt-4o'ya gidebiliyordu.
*/

const base = {
  actionCode: "AI_CHAT_STANDARD" as const,
  hasImage: false,
  difficulty: "hard" as const,
};

describe("yönlendirici yükseltmeyi görünür kılıyor", () => {
  it("premium zor soruda yükseltme işaretleniyor", () => {
    const route = selectModel({ ...base, isPremium: true });
    expect(route.upgrade).toBe("difficulty");
    // Kredi yükselmiyor; ödenen şey değişmedi.
    expect(route.actionCode).toBe("AI_CHAT_STANDARD");
  });

  it("tavan dolduğunda standart modele düşüyor", () => {
    const route = selectModel({
      ...base,
      isPremium: true,
      hardUpgradeAllowed: false,
    });
    expect(route.upgrade).toBeNull();
    expect(route.actionCode).toBe("AI_CHAT_STANDARD");
    expect(route.model).not.toBe(
      selectModel({ ...base, isPremium: true }).model,
    );
  });

  /* Tavan yalnızca bedelini bizim ödediğimiz dalda işlemeli; ödenmiş
     yükseltmeleri kısmak, öğrencinin satın aldığı şeyi geri almak olurdu. */
  it("ödenmiş yollar tavandan etkilenmiyor", () => {
    const image = selectModel({
      ...base,
      isPremium: true,
      hasImage: true,
      hardUpgradeAllowed: false,
    });
    expect(image.actionCode).toBe("IMAGE_SOLUTION");
    expect(image.upgrade).toBeNull();

    const paidAdvanced = selectModel({
      actionCode: "AI_CHAT_ADVANCED",
      isPremium: true,
      hasImage: false,
      userSelectedAdvanced: true,
      hardUpgradeAllowed: false,
    });
    expect(paidAdvanced.actionCode).toBe("AI_CHAT_ADVANCED");
    expect(paidAdvanced.upgrade).toBeNull();
  });

  it("ücretsiz hesapta zaten yükseltme yok", () => {
    expect(selectModel({ ...base, isPremium: false }).upgrade).toBeNull();
  });
});

describe("hak isteme", () => {
  // `is_admin` ayrı cevaplanıyor: yönetici tavana yazılmıyor (bkz.
  // admin-bypass-server.test.ts), buradaki senaryolar normal öğrenci.
  const fakeService = (response: { data?: unknown; error?: unknown }) =>
    ({
      rpc: vi.fn(async (fn: string) =>
        fn === "is_admin" ? { data: false, error: null } : response,
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  it("tavanı tek yerden gönderiyor", async () => {
    const service = fakeService({ data: true, error: null });
    await claimHardUpgrade(service, "user-1");
    expect(service.rpc).toHaveBeenCalledWith("claim_model_upgrade", {
      p_user_id: "user-1",
      p_limit: HARD_UPGRADE_MONTHLY_LIMIT,
    });
  });

  /* Sayaç çalışmıyorsa herkese sınırsız gpt-4o vermek, ölçmediğimiz bir
     maliyeti açık bırakmak olurdu. Öğrenci cevabını yine alıyor. */
  it("hata hâlinde kapalıya düşüyor", async () => {
    expect(
      await claimHardUpgrade(fakeService({ error: { message: "down" } }), "u"),
    ).toBe(false);
  });

  it("belirsiz yanıtı hak saymıyor", async () => {
    expect(await claimHardUpgrade(fakeService({ data: null, error: null }), "u")).toBe(
      false,
    );
  });
});

describe("migration", () => {
  const sql = readFileSync(
    "supabase/migrations/20260918110000_hard_upgrade_cap.sql",
    "utf8",
  );

  it("sayaç tablosu istemciye kapalı", () => {
    expect(sql).toContain(
      "ALTER TABLE public.model_upgrade_grants ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*model_upgrade_grants/);
  });

  /* Okuyup sonra yazan iki ayrı sorgu, yan yana gelen iki istekte tavanı
     aşardı. Tek ifade satırı kilitliyor. */
  it("sayma ve karar tek ifadede", () => {
    expect(sql).toMatch(/INSERT INTO public\.model_upgrade_grants[\s\S]*ON CONFLICT \(user_id\) DO UPDATE/);
  });

  /* `used = p_limit` hem son hakkı veren hem tavanı dolduran durum olsaydı
     tavan hiç kapanmazdı; sayaç bu yüzden `p_limit + 1`'de duruyor. */
  it("sayaç tavanın bir üstünde duruyor", () => {
    expect(sql).toContain("LEAST(public.model_upgrade_grants.used + 1, p_limit + 1)");
    expect(sql).toContain("RETURN v_used <= p_limit;");
  });

  it("ay değişince sıfırlanıyor", () => {
    expect(sql).toMatch(/v_period date := date_trunc\('month', now\(\)\)::date/);
    expect(sql).toMatch(/WHEN public\.model_upgrade_grants\.period_start <> v_period THEN 1/);
  });

  it("SECURITY DEFINER fonksiyonun arama yolu ve yetkileri sabit", () => {
    expect(sql).toMatch(
      /ALTER FUNCTION public\.claim_model_upgrade\(uuid, integer\) SET search_path = public, pg_temp/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_model_upgrade\(uuid, integer\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_model_upgrade\(uuid, integer\) TO service_role/,
    );
  });
});

describe("sohbet ucu tavanı işletiyor", () => {
  const source = readFileSync("src/app/api/ai/chat/route.ts", "utf8");

  it("yalnızca gerçekten yükseltilen istekte hak soruyor", () => {
    expect(source).toContain('routed.upgrade === "difficulty"');
    expect(source).toContain("claimHardUpgrade(service, userId)");
  });

  /* Tavan dolunca istek reddedilirse öğrenci ödediği krediyi alamadığı bir
     duvara çarpar; kaybedilmesi gereken şey yalnızca ikram. */
  it("tavan dolunca isteği reddetmiyor, yeniden yönlendiriyor", () => {
    expect(source).toContain("selectModel({ ...routerInput, hardUpgradeAllowed: false })");
  });
});

describe("deneme üretimi fiyatı", () => {
  const bumpSql = readFileSync(
    "supabase/migrations/20260918100000_practice_exam_cost.sql",
    "utf8",
  );
  const engineSql = readFileSync(
    "supabase/migrations/20260926160000_practice_exam_mock_engine.sql",
    "utf8",
  );

  /* İlk düzeltme: 4 → 5. Sonra değerlendirme üretimin içine alındı: 8. */
  it("önce 5 krediye çıktı", () => {
    expect(bumpSql).toMatch(/UPDATE public\.credit_rules[\s\S]*SET credit_cost = 5/);
    expect(bumpSql).toMatch(/WHERE action_code = 'PRACTICE_EXAM_GENERATE'/);
  });

  it("değerlendirme dahil 8 kredi; GRADE 0", () => {
    expect(engineSql).toMatch(/SET credit_cost = 8/);
    expect(engineSql).toMatch(/WHERE action_code = 'PRACTICE_EXAM_GENERATE'/);
    expect(engineSql).toMatch(/SET credit_cost = 0/);
    expect(engineSql).toMatch(/WHERE action_code = 'PRACTICE_EXAM_GRADE'/);
  });

  it("görsel çözümünün altında kalmıyor (üretim tabanı)", () => {
    const init = readFileSync(
      "supabase/migrations/20250825120000_init.sql",
      "utf8",
    );
    const image = init.match(/\('IMAGE_SOLUTION',\s*(\d+)/);
    expect(image).not.toBeNull();
    expect(8).toBeGreaterThanOrEqual(Number(image![1]));
  });
});

describe("ücretsiz hesapta günlük fotoğraf tavanı", () => {
  /* Fotoğraf sistemdeki en pahalı eylem: gören tek model gelişmiş olan.
     Normalde kredi frenliyor (6 kredi / 5 kredi = günde bir fotoğraf) ama
     `referral_tiers` abone getiren daveti 400 katsayıyla ödüllendiriyor ve
     orada fren tümüyle kayboluyordu. */
  it("tavana kadar geçiriyor, sonra kapatıyor", async () => {
    const user = `free-${Date.now()}`;
    for (let i = 0; i < FREE_IMAGE_DAILY_LIMIT; i += 1) {
      expect(await freeImageAllowed(user, false)).toBe(true);
    }
    expect(await freeImageAllowed(user, false)).toBe(false);
  });

  /* Abonelik kendi kotasını zaten ödüyor; sayaca dokunmak gereksiz bir tur. */
  it("premium hesap sayaca hiç girmiyor", async () => {
    const user = `plus-${Date.now()}`;
    for (let i = 0; i < FREE_IMAGE_DAILY_LIMIT + 5; i += 1) {
      expect(await freeImageAllowed(user, true)).toBe(true);
    }
    // Sayaç boş kaldığı için ücretsize düşse bile tavanı yeni baştan alıyor.
    expect(await freeImageAllowed(user, false)).toBe(true);
  });

  /* Davetle gelen öğrencinin çarpanı 3 ve 18 kredisi tam 3 fotoğraf ediyor;
     tavan bu yüzden 3 — kimsenin elinden bir şey almıyor, yalnızca 400'lük
     çarpanın açtığı deliği kapatıyor. */
  it("davet çarpanının verdiği hakkı kesmiyor", () => {
    expect(FREE_IMAGE_DAILY_LIMIT).toBe(3);
  });

  it.each([
    "src/app/api/ai/chat/route.ts",
    "src/app/api/ai/solve-image/route.ts",
  ])("%s tavanı uyguluyor", (file) => {
    const source = readFileSync(file, "utf8");
    // Yönetici bayrağı istek gövdesinden değil, `withUser` bağlamından geliyor.
    expect(source).toContain("freeImageAllowed(userId, isPremium, isAdmin)");
    expect(source).toMatch(/const \{[^}]*\bisAdmin\b[^}]*\} = guard\.ctx/);
    expect(source).toContain('errorResponse(429, "free_image_limit")');
  });

  /* Denetimden geçemeyen istek öğrencinin hakkını yakmamalı — krediyi de
     denetimden sonra ayırıyoruz. Tavan kontrolü `moderate` çağrısından
     sonra gelmeli. */
  it.each([
    "src/app/api/ai/chat/route.ts",
    "src/app/api/ai/solve-image/route.ts",
  ])("%s tavanı denetimden sonra soruyor", (file) => {
    const source = readFileSync(file, "utf8");
    const cap = source.indexOf("freeImageAllowed(userId, isPremium, isAdmin)");
    expect(cap).toBeGreaterThan(-1);
    expect(source.indexOf("await moderate(")).toBeLessThan(cap);
  });
});
