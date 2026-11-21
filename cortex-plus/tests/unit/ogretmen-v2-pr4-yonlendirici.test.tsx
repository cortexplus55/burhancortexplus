// @vitest-environment jsdom
/**
 * Faz 13 PR-4 (PROMPT-V2 §5–§6): yönlendirici ve öğretmenin açılışı. Modelsiz ve deterministik: niyet (kural), öncelik
 * sırası, süreye tam eşit plan, açılış cümlesi (M2), analiz çipleri (M4), teşhis (M5), sohbet turu satırı. Her plan
 * maddesi bir kayda bağlı; kayıt yoksa dürüst "seni daha tanımıyorum". Açılış ve süre çipleri model ve kota harcamaz.
 * Örnekler fizik, tarih, kimya, biyoloji.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAN_MINUTES,
  analysisChips,
  buildPlan,
  classifyIntent,
  diagnosis,
  directorTurnLine,
  openingLine,
  prioritize,
  teacherPlanView,
} from "@/lib/teacher/director";
import type { Dossier, DossierSignals } from "@/lib/teacher/dossier";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const EMPTY: DossierSignals = { reviews: null, weak: [], behind: [], exam: null, nextStep: null, heavySection: null };

const FULL: DossierSignals = {
  reviews: { count: 6, href: "/deneme-sinavlari/p1/tekrar" },
  weak: [{ label: "Newton yasaları", count: 3, href: "/yanlislarim?konu=newton" }],
  behind: [
    { topic: "Momentum", days: 2, href: "/deneme-sinavlari/p1/dugum/n4", minutes: 15, prepTitle: "Fizik vizesi", examDaysLeft: 5 },
    { topic: "Enerji", days: 1, href: "/deneme-sinavlari/p1/dugum/n5", minutes: 12, prepTitle: "Fizik vizesi", examDaysLeft: 5 },
  ],
  exam: { title: "Fizik vizesi", daysLeft: 5, href: "/deneme-sinavlari/p1" },
  nextStep: { title: "Tork", href: "/deneme-sinavlari/p1/dugum/n6", minutes: 15 },
  heavySection: { title: "Dinamik", documentName: "fizik-notu.pdf", from: 2, to: 3 },
};

describe("niyet (kural, modelsiz)", () => {
  it.each([
    ["Yarın tarih sınavım var, çok stresliyim", "exam_soon"],
    ["3 gün sonra kimya vizesi var", "exam_soon"],
    ["Bugün ne çalışayım?", "suggest"],
    ["Nereden başlamalıyım bilmiyorum", "suggest"],
    ["Organik kimyada çok zorlanıyorum", "struggle"],
    ["Mitoz ile mayoz arasındaki fark nedir?", "concept"],
    ["Bana Tanzimat Fermanı'nı anlat", "concept"],
    ["selam", "chat"],
  ])("%s → %s", (message, intent) => {
    expect(classifyIntent(message)).toBe(intent);
  });

  it("görsel çözüm, ekli belge öncelikli", () => {
    expect(classifyIntent("bunu çöz", { hasImage: true })).toBe("solve");
    expect(classifyIntent("bu notu özetle", { documentAttached: true })).toBe("document");
  });
});

describe("öncelik ve plan", () => {
  it("sıra: vadesi gelen tekrar > çok yanlış > geciken adım; belge bölümü yalnız gecikme yokken; sıradaki adım sonda", () => {
    expect(prioritize(FULL).map((item) => item.key)).toEqual([
      "reviews",
      "weak:Newton yasaları",
      "behind:/deneme-sinavlari/p1/dugum/n4",
      "behind:/deneme-sinavlari/p1/dugum/n5",
      "next",
    ]);
    const noBehind = { ...FULL, behind: [] };
    expect(prioritize(noBehind).map((item) => item.key)).toEqual(["reviews", "weak:Newton yasaları", "document", "next"]);
  });

  it.each(PLAN_MINUTES)("%i dk planı toplamı tam seçilen süre, en çok 4 madde, her madde bir kayda bağlı", (minutes) => {
    const plan = buildPlan(FULL, minutes);
    expect(plan.reduce((sum, item) => sum + item.minutes, 0)).toBe(minutes);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(4);
    expect(plan.every((item) => item.href.startsWith("/") && item.reason.length > 0)).toBe(true);
  });

  it("kayıt yoksa plan yok (uydurma madde yok)", () => {
    expect(buildPlan(EMPTY, 20)).toEqual([]);
  });
});

describe("açılış, çipler, teşhis", () => {
  it("M2: ad, gerçek veriden en çok iki bilgi, süre sorusu; veri yoksa yalnız selam ve soru", () => {
    const line = openingLine(FULL, { name: "Elif", seed: "u:2026-11-15" });
    expect(line.startsWith("Merhaba Elif!")).toBe(true);
    expect(line).toContain("Momentum 2 gün gecikti.");
    expect(line).toContain("Fizik vizesi sınavına 5 gün var.");
    expect(line).toMatch(/(?:vaktin var|ayırabilirsin)\?$/);
    expect(openingLine(EMPTY, { name: null, seed: "x" })).toMatch(/^Merhaba! Bugün (?:ne kadar vaktin var|kaç dakika ayırabilirsin)\?$/);
  });

  it("M4: en çok 3 çip, bulgusu olanlar önce, sayılar okumadan", () => {
    const chips = analysisChips([
      { source: "documents", label: "Belgeler", count: 0 },
      { source: "mistakes", label: "Yanlışlar", count: 4 },
      { source: "reviews", label: "Tekrar", count: 6 },
      { source: "plan", label: "Plan", count: 2 },
    ]);
    expect(chips).toEqual(["Yanlışlarına baktı · 4 kayıt", "Tekrar kuyruğuna baktı · 6", "Planına baktı · 2 gecikme"]);
  });

  it("M5: teşhis veriden, en çok iki cümle; veri yoksa dürüst cümle", () => {
    const text = diagnosis(FULL, "u:2026-11-15");
    expect(text).toMatch(/Newton yasaları/);
    expect(text).toMatch(/Momentum/);
    expect(text.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(2);
    expect(diagnosis(EMPTY, "x")).toBe("Seni daha tanımıyorum; birkaç soruyla başlayalım.");
  });

  it("açılış görünümü üç süre planını tek okumada taşır", () => {
    const dossier = { signals: FULL, checks: [], empty: false } as unknown as Dossier;
    const view = teacherPlanView(dossier, { name: "Elif", seed: "s" });
    expect(Object.keys(view.plans)).toEqual(["10", "20", "45"]);
  });
});

describe("sohbet turu satırı", () => {
  it("yalnız zorlanma, öneri ve yakın sınav turunda; tek öneri, ilk plan maddesinden", () => {
    expect(directorTurnLine("concept", FULL)).toBe("");
    expect(directorTurnLine("chat", FULL)).toBe("");
    const line = directorTurnLine("suggest", FULL);
    expect(line).toContain("TEK öneri");
    expect(line).toContain("6 tekrar");
    expect(directorTurnLine("exam_soon", FULL)).toContain("Sınav yaklaşıyor");
  });

  it("kayıt yoksa uydurma geçmiş yok: dürüst tanışma", () => {
    expect(directorTurnLine("struggle", EMPTY)).toContain("dürüstçe onu daha tanımadığını söyle");
  });
});

describe("modelsiz ve kotasız; bayrak kapısı; kişisel veri adreste yok", () => {
  it("yönlendirici ve plan ucu model çağırmaz, kredi ayırmaz; ad adreste taşınmaz", () => {
    const director = read("src/lib/teacher/director.ts");
    const route = read("src/app/api/teacher/plan/route.ts");
    for (const source of [director, route]) {
      expect(source).not.toMatch(/openai|generateJson|createChatDraft|reserveCredits|credit_reserve/i);
    }
    expect(route).toContain("isFeatureEnabled(service, TEACHER_V2_FLAG, userId)");
    expect(route).toContain('{ status: 404 }');
    expect(route).not.toContain('searchParams.get("ad")');
  });

  it("sohbet: öğretmen v3 karşılaması yalnız bayrak açıkken; turda yönlendirici PR-1 satırlarından önce", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    // Öğretmen v3 (21 Kasım 2026): eski açılış akışının yerine karşılama ekranı (selam ve haplar); bayrak kapalıyken yok.
    expect(panel).not.toContain("TeacherOpening");
    expect(panel).toContain("const v3 = v2Main && !examChrome;");
    expect(panel).toContain("<TeacherV3Welcome");
    const chat = read("src/app/api/ai/chat/route.ts");
    const director = chat.indexOf("directorTurnLine(classifyIntent(");
    const session = chat.indexOf("teacherV2SessionLines({ session: v2Session");
    expect(director).toBeGreaterThan(0);
    expect(director).toBeLessThan(session);
  });
});
