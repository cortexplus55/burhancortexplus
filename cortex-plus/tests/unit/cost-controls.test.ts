import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { selectModel } from "@/lib/ai/model-router";
import {
  HARD_UPGRADE_MONTHLY_LIMIT,
  claimHardUpgrade,
} from "@/lib/ai/model-upgrade";
import { FREE_LIMITS, defaultFreeMeter } from "@/lib/billing/free-meters";

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

/*
  2 Ekim 2026: içerik ve öğretmen işleri herkes için tek asıl modelde
  (gpt-6-luna). Zor soruda daha güçlü modele çıkma dalı kalmadı; yükseltme
  işareti hiçbir yolda yazılmıyor, tavan da işletilecek bir şey bulmuyor.
*/
describe("yönlendirici yükseltme yazmıyor", () => {
  it("premium zor soruda bile yükseltme yok, kredi standart", () => {
    const route = selectModel({ ...base, isPremium: true });
    expect(route.upgrade).toBeNull();
    expect(route.actionCode).toBe("AI_CHAT_STANDARD");
  });

  it("tavan kapalıyken de aynı model", () => {
    expect(selectModel({ ...base, isPremium: true, hardUpgradeAllowed: false }).model).toBe(
      selectModel({ ...base, isPremium: true }).model,
    );
  });

  it("görsel ve ödenmiş gelişmiş sohbet kendi kodunu korur", () => {
    const image = selectModel({ ...base, isPremium: true, hasImage: true, hardUpgradeAllowed: false });
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

  it("ücretsiz hesapta da yükseltme yok", () => {
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

describe("ücretsiz hesapta günlük fotoğraf sayacı", () => {
  /* Fotoğraf en pahalı sohbet işi (gören model). 18 Eylül 2026'dan beri ayrı bir Redis tavanıyla (günde 3)
     frenleniyordu; 24 Ekim 2026'dan beri ücretsiz hesap krediyle değil sayaçla çalışıyor ve fotoğraf
     kredi ayırmasının kendi sayacında (`credit_reserve_metered`, günde 1). Tavan artık tek yerde. */
  it("günde bir fotoğraf; IMAGE_SOLUTION fotoğraf sayacına düşer", () => {
    expect(FREE_LIMITS.photo).toBe(1);
    expect(defaultFreeMeter("IMAGE_SOLUTION")).toBe("photo");
  });

  it("sohbet ucu fotoğraflı mesajı fotoğraf sayacına yazar, denetimden sonra", () => {
    const source = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
    expect(source).not.toContain("freeImageAllowed");
    const reserve = source.indexOf('{ freeMeter: imageUrl ? "photo" : "chat" }');
    expect(reserve).toBeGreaterThan(-1);
    expect(source.indexOf("await moderate(")).toBeLessThan(reserve);
  });

  it("soru çözücü ayırmayı denetimden sonra yapar; fotoğraf için ayrı tavan yok", () => {
    const run = readFileSync("src/lib/solve/solve-run.ts", "utf8");
    expect(run).not.toContain("freeImageAllowed");
    expect(run).toContain('const actionCode: ActionCode = image ? "IMAGE_SOLUTION" : "AI_CHAT_STANDARD";');
    expect(run).toContain("reserveCredits(service, userId, actionCode, input.idempotencyKey)");
    const route = readFileSync("src/app/api/ai/solve/route.ts", "utf8");
    expect(route.indexOf("await moderate(")).toBeGreaterThan(-1);
    expect(route.indexOf("await moderate(")).toBeLessThan(route.indexOf("await runSolve("));
  });
});
