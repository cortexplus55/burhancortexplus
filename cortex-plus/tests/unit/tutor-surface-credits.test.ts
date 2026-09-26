import { readFileSync, readdirSync } from "node:fs";
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
      const sql = readFileSync(join(dir, file), "utf8");
      for (const match of sql.matchAll(/\('([A-Z0-9_]+)',\s*(\d+)\s*,/g)) {
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
    expect(CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits).toBe(1);
    expect(CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits).toBe(2);
    expect(CREDIT_PRICE_TABLE.AUDIO_SYNTHESIZE.credits).toBe(1);
  });

  it("ses kredisi 900 karakterdir ve sohbet bir kez ayırır", () => {
    const cache = readFileSync("src/lib/learning/audio-cache.ts", "utf8");
    expect(cache).toContain(`AUDIO_CHARS_PER_CREDIT = ${AUDIO_CHARS_PER_CREDIT_PRICE}`);
    expect(cache.match(/reserveCredits\(/g)).toHaveLength(1);
    const chat = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
    expect(chat.match(/reserveCredits\(/g)).toHaveLength(1);
    const panel = readFileSync("src/components/chat/chat-panel.tsx", "utf8");
    expect(panel).toContain("cp-exam-credit");
    expect(panel).toContain("{chatCreditCost} kr");
    const audioRoute = readFileSync("src/app/api/learning/podcast/audio/route.ts", "utf8");
    expect(audioRoute).not.toMatch(/\bensureAudio\s*\(/);
    expect(audioRoute.match(/synthesizeCharged\(/g)?.length).toBeGreaterThan(0);
    expect(audioRoute).toContain('errorResponse(402, "insufficient_credits")');
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).toContain("CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits");
    expect(session).toContain("AUDIO_CHARS_PER_CREDIT_PRICE");
    expect(session).toContain("router.refresh()");
    const player = readFileSync("src/components/parity/exam-podcast-player.tsx", "utf8");
    expect(player).toContain("creditsSpent");
    const lessonRepair = readFileSync("src/lib/learning/lesson-repair.ts", "utf8");
    expect(lessonRepair).toContain("repairTurkishSurface");
  });
});
