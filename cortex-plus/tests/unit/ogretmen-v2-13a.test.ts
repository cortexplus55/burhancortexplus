/**
 * Faz 13A · öğretmen hissi (teacher.v2), 15 Kasım 2026. PROMPT §4 A ve I, EK-4, EK-6, EK-7.
 * Tek hamle: en çok bir soru ve bir destek kutusu; soru soran mesajda "Akılda kalsın" yok; iç sistem dili yok; en çok 3
 * çip. Kod yalnız siler, cümle yazmaz. Bayrak kapalıyken bugünkü davranış (S12). Örnekler farklı derslerden.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ONE_MOVE_HARD_CAP,
  ONE_MOVE_MARKUP,
  ONE_MOVE_MAX_CHIPS,
  ONE_MOVE_WORDS,
  TEACHER_V2_FLAG,
  asksQuestion,
  oneMoveMetrics,
  settleOneMove,
} from "@/lib/ai/teacher-v2";

const read = (path: string) => readFileSync(path, "utf8");

/** G1/S1 biçimi (matematik): kutu yığını + soru + Akılda kalsın. */
const S1_LIKE = [
  "2⁻³ = 1/8, çünkü negatif üs tabanın ==tersini alır==.",
  "> 💡 Benzetme: Negatif üs, sayıyı kesrin paydasına taşımak gibidir.",
  "> 📌 Sınav ipucu: Negatif üs işareti sonucu negatif yapmaz.",
  "Sence 2⁻² kaçtır?",
  "> ✅ Akılda kalsın:\n> - Negatif üs, tabanın ==tersini alır==.",
].join("\n\n");

describe("tek hamle kodu (yalnız siler)", () => {
  it("soru soran mesajda Akılda kalsın çıkar, ikinci destek kutusu çıkar, ilk kutu kalır", () => {
    const out = settleOneMove(S1_LIKE);
    expect(out.removedRemember).toBe(true);
    expect(out.removedBoxes).toBe(1);
    expect(out.text).toContain("> 💡 Benzetme:");
    expect(out.text).not.toContain("Sınav ipucu");
    expect(out.text).not.toContain("Akılda kalsın");
    expect(out.text).toContain("Sence 2⁻² kaçtır?");
    expect(oneMoveMetrics(out.text)).toMatchObject({ questions: 1, boxes: 1, remember: false });
  });

  it("soru sormayan mesajda (doğru cevaptan sonra kapanış) Akılda kalsın kalır", () => {
    const closing = [
      "Evet, mitozda iki özdeş hücre oluşur.",
      "> ✅ Akılda kalsın:\n> - Mitoz sonunda ==2== özdeş hücre oluşur.",
    ].join("\n\n");
    const out = settleOneMove(closing);
    expect(out.removedRemember).toBe(false);
    expect(out.text).toBe(closing);
  });

  it("iç sistem dili cümlesi silinir, öbür cümleler kalır (tarih örneği)", () => {
    const text = "Notundaki hazırlık parçalarında bu konuya eşleşen bölüm bulunamadı. Tanzimat 1839'da ilan edildi. Ne değiştirdi sence?";
    const out = settleOneMove(text);
    expect(out.internalStripped).toBe(1);
    expect(out.text).toBe("Tanzimat 1839'da ilan edildi. Ne değiştirdi sence?");
  });

  it("kutu içindeki soru işareti ve formül soru sayılmaz", () => {
    expect(asksQuestion("> 🤔 Neden böyle? Çünkü enerji korunur.\n\n$$E = mc^2$$")).toBe(false);
    expect(asksQuestion("Kuvvet artınca ivme ne olur?")).toBe(true);
  });

  it("kelime tavanında kod kesmez (cümle yarım kalmasın); ölçü günlüğe", () => {
    const long = Array.from({ length: 130 }, () => "kelime").join(" ") + ".";
    expect(settleOneMove(long).text).toBe(long);
    expect(oneMoveMetrics(long).words).toBe(130);
  });
});

describe("istem", () => {
  it("tek hamle kuralı sayılarla ve EK-4/EK-5/I ile", () => {
    expect(ONE_MOVE_WORDS).toBe(90);
    expect(ONE_MOVE_HARD_CAP).toBe(110);
    expect(ONE_MOVE_MAX_CHIPS).toBe(3);
    expect(ONE_MOVE_MARKUP).toContain("En çok BİR soru");
    expect(ONE_MOVE_MARKUP).toContain("YALNIZ soru sormayan mesajda");
    expect(ONE_MOVE_MARKUP).toContain("Bu konu notunda yok; ders kitabı bilgisiyle anlatıyorum.");
    expect(ONE_MOVE_MARKUP).toContain("Uzlaşıma bağlı konularda");
    // Ders ya da konu sözcüğü yok.
    expect(ONE_MOVE_MARKUP).not.toMatch(/üslü|enerji|mitoz|tanzimat/i);
  });
});

describe("sohbet ucu: bayrak arkasında, model çağrısı eklenmez", () => {
  const route = read("src/app/api/ai/chat/route.ts");

  it("bayrak kişi bazlı okunur; kapalıyken bugünkü istem ve sıralı denetim (S12)", () => {
    expect(TEACHER_V2_FLAG).toBe("teacher.v2");
    expect(route).toContain("isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false)");
    expect(route).toContain("const parallelModeration = (Boolean(rest.prepId) || teacherV2) && !imageUrl;");
    expect(route).toContain("${teacherV2 ? ONE_MOVE_MARKUP : CHAT_TEACHING_MARKUP}");
  });

  it("kod katmanı akışın bitişinde, kayıttan önce; yalnız teacher.v2'de ve ana sohbette", () => {
    const at = route.indexOf("const settled = settleOneMove(content);");
    expect(at).toBeGreaterThan(route.indexOf("content = settlePedagogicalLabels(content"));
    expect(at).toBeLessThan(route.indexOf('service.rpc("complete_chat_operation"'));
    expect(route).toContain("if (teacherV2 && charge && !(rest.prepId && prepGrounding)) {");
    expect(route).toContain('console.info("teacher_v2_turn"');
  });

  it("modülde model çağrısı yok", () => {
    expect(read("src/lib/ai/teacher-v2.ts")).not.toMatch(/openai|chat\.completions|generateJson|fetch\(/);
  });
});

describe("ekran: en çok 3 çip", () => {
  it("yanıt çipleri tavanlı; yanıtın kendi çipi varken genel devam önerileri gizli", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toContain("maxChips={teacherV2 ? ONE_MOVE_MAX_CHIPS : undefined}");
    expect(panel).toContain('!(teacherV2 && tutorStyle !== "direct_solve")');
    expect(read("src/components/chat/tutor-reply-view.tsx")).toContain("maxChips != null ? next.slice(0, maxChips) : next");
    expect(read("src/app/ogretmen/page.tsx")).toContain("teacherV2={teacherV2}");
  });
});
