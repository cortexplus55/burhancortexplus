import { readFileSync, readdirSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { finalizeTutorReply, polishTutorSurface } from "@/lib/learning/tutor-reply";
import { gradeStudentClaim } from "@/lib/learning/tutor-quant";
import {
  AUDIO_CHARS_PER_CREDIT_PRICE,
  CREDIT_PRICE_TABLE,
  PLUS_CHAT_IS_FREE,
} from "@/lib/credits/price-table";
import type { SyllabusScope } from "@/lib/learning/prep-corpus";

const LIVE_DRAFT = [
  "Yanlış: kütleyi (gramı) doğrudan kıyaslamak sınırlayıcıyı bulmaz.",
  "Hüküm: Yanlış.",
  "Doğru parça: Sınırlayıcı bileşeni bulurken kütleleri (gramları) doğrudan kıyaslamak yeterli değildir.",
  "Yanlış parça: \"Hangisi daha az gramsa o sınırlayıcıdır.\" ifadesi yanıltıcıdır çünkü sınırlayıcı bileşen, moleküler oranlara göre hesaplanır.",
  "Sonuç: Önce her maddeni mol sayısını hesaplarsınız, sonra bu mol sayılarını tepkime denkleminin katsayılarına bölerek hangi bileşenin sınırlayıcı olduğunu bulursunuz. Hangi bileşenin mol sayısı en küçük oranda kalırsa o sınırlayıcıdır.",
  "Şimdi bu bilgiyi göz önünde bulundurarak şu soruyu sorayım: Eğer elimizde 10 gram C ve 5 gram D varsa ve tepkime şu şekilde ise: 4C + 3D → 2E. Hangi bileşen sınırlayıcıdır?",
  "Hesaplamalarını yapabilir misin?",
  "Önce mollere çevir, sonra her maddeyi kendi katsayısına böl. Küçük oran sınırlayıcıdır.",
].join("\n");

describe("tutor surface", () => {
  it("hükmü, tekrar kuralı ve ikinci soruyu düşürür; iyeliği düzeltir", () => {
    const polished = polishTutorSurface(LIVE_DRAFT);
    expect(polished).toMatch(/^Yanlış:/);
    expect(polished).not.toMatch(/Hüküm:/);
    expect(polished).not.toMatch(/Hesaplamalarını yapabilir misin/);
    expect(polished).not.toMatch(/Önce mollere çevir/);
    expect(polished).toContain("her maddenin mol");
    expect(polished).not.toMatch(/her maddeni\b/);
    expect(polished.match(/\?/g)).toHaveLength(1);
    expect(polished).toMatch(/Hangi bileşen sınırlayıcıdır\?/);
  });

  it("notlandırılmış yanıtta da tek hüküm kalır", () => {
    const grade = gradeStudentClaim({
      student: "Hangisi daha az gramsa o sınırlayıcıdır.",
      context: "2A + B → C",
    });
    expect(grade?.verdict).toBe("yanlis");
    const scope = { excluded: [], weighted: [] } as SyllabusScope;
    const shaped = finalizeTutorReply({
      message: "Hangisi daha az gramsa o sınırlayıcıdır.",
      draft: LIVE_DRAFT,
      decision: "in",
      scope,
      grade,
    });
    const body = shaped.content.split("[[chip:")[0] ?? "";
    expect(body.match(/Hüküm:/g) ?? []).toHaveLength(0);
    expect(body).toMatch(/\[\[hukum:yanlis\|Tekrar bakalım\]\]|Tekrar bakalım/);
    expect(body).not.toMatch(/Doğru kısım:/);
    expect(body).not.toMatch(/Yanlış kısım:/);
    expect((body.match(/\?/g) ?? []).length).toBe(1);
    // İyelik onarımı ya LIVE_DRAFT'taki Sonuç satırında ya da warmLine'da görünür.
    expect(body.toLocaleLowerCase("tr")).toMatch(/her madde(?:nin|yi) mol|mollere çevir/);
  });
});

describe("kredi fiyat tablosu", () => {
  it("migration'lardaki son fiyatla aynıdır", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const costs: Record<string, number> = {};
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = readSource(join(dir, file));
      for (const match of sql.matchAll(/\('([A-Z0-9_]+)',\s*(\d+)\s*[,)]/g)) {
        costs[match[1] ?? ""] = Number(match[2]);
      }
      for (const match of sql.matchAll(/credit_cost\s*=\s*(\d+)[\s\S]{0,240}?action_code\s*=\s*'([A-Z0-9_]+)'/g)) {
        costs[match[2] ?? ""] = Number(match[1]);
      }
    }
    for (const [code, price] of Object.entries(CREDIT_PRICE_TABLE)) {
      expect(costs[code], code).toBe(price.credits);
    }
    expect(PLUS_CHAT_IS_FREE).toBe(false);
    // Kredi v3 (24 Ekim 2026): 1 kredi ≈ $0,001 gerçek maliyet. Ders 6 → 30 (ölçülen ~$0,03);
    // mesaj 3 kalır (ürün sahibinin kararı: denetim luna'da, genel cevap tek çağrı).
    expect(CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits).toBe(3);
    expect(CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits).toBe(30);
    // 19 Ekim 2026: 2 → 15 (ölçülen maliyet 900 karakter ≈ $0,015, ürün sahibinin kararı).
    expect(CREDIT_PRICE_TABLE.AUDIO_SYNTHESIZE.credits).toBe(15);
  });

  it("ses kredisi 900 karakterdir ve sohbet bir kez ayırır", () => {
    const cache = readSource("src/lib/learning/audio-cache.ts");
    expect(cache).toContain(`AUDIO_CHARS_PER_CREDIT = ${AUDIO_CHARS_PER_CREDIT_PRICE}`);
    expect(cache.match(/reserveCredits\(/g)).toHaveLength(1);
    const chat = readSource("src/app/api/ai/chat/route.ts");
    expect(chat.match(/reserveCredits\(/g)).toHaveLength(1);
    const panel = readSource("src/components/chat/chat-panel.tsx");
    // 29 Eylül 2026: öğrenci işlem başına kredi görmüyor (Astra gibi yalnızca yüzde).
    expect(panel).not.toContain("cp-exam-credit");
    expect(panel).not.toMatch(/{chatCreditCost} (kr|kredi)/);
    const audioRoute = readSource("src/app/api/learning/podcast/audio/route.ts");
    expect(audioRoute).not.toMatch(/\bensureAudio\s*\(/);
    expect(audioRoute.match(/synthesizeCharged\(/g)?.length).toBeGreaterThan(0);
    // Ret kodu synthesizeCharged'dan: hak bitti `insufficient_credits`, ücretsizde Plus `premium_required`.
    expect(audioRoute).toContain("errorResponse(402, result.reason)");
    const session = readSource("src/components/parity/exam-node-session.tsx");
    expect(session).not.toMatch(/d* ?kr düşüldü|CREDIT_PRICE_TABLE/);
    expect(session).toContain("router.refresh()");
    const player = readSource("src/components/parity/exam-podcast-player.tsx");
    expect(player).toContain("creditsSpent");
  });
});
