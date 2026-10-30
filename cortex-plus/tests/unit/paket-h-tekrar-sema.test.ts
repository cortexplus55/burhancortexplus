import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  DIAGRAM_COMPLETION_SYSTEM,
  diagramCompletionUserPrompt,
  dropRepeatedChecks,
  parseDiagramCompletion,
  repeatedCheck,
  sameLessonQuestion,
} from "@/lib/learning/teacher-lesson";
import { questionSignature, symbolicAtoms } from "@/lib/learning/teacher-brain";
import { screenCheck, type LessonScreen, type LessonV3 } from "@/lib/learning/lesson-v3";

/*
  Paket H (29 Ekim 2026): ders içi soru tekrarı kısa hesap sorularında da yakalanır; diagram_card eksikse dersi
  gören tek küçük tamamlama çağrısı yapılır, kart temellenmezse ders aynen yayımlanır.
*/

/* ───────────── Tekrar: kısa hesap sorusu ───────────── */

const text = (value: string): LessonScreen["blocks"][number] => ({ type: "text", text: value });
const mcq = (prompt: string): LessonScreen["blocks"][number] => ({
  type: "check",
  check: {
    type: "mcq",
    prompt,
    options: ["3", "5", "8", "11"],
    answerIndex: 2,
    explanation: "Fonksiyonun kuralına değer yerine yazılır; sonuç 8.",
    optionWhy: ["Eksik toplama.", "Yarım işlem.", "Kurala göre doğru değer.", "Fazla toplama."],
  },
});
const screen = (heading: string, blocks: LessonScreen["blocks"]): LessonScreen => ({ heading, concept: heading, blocks });

describe("Paket H · kısa hesap sorusunun tekrarı imzayla yakalanır", () => {
  it("'k=8,5 için f(6) kaçtır?' ile 'k = 8,5 olduğunda f(6) değeri nedir?' aynı soru; f(3) ve türev yeni soru", () => {
    expect(sameLessonQuestion("k = 8,5 için f(6) kaçtır?", "k=8,5 olduğunda f(6) değeri nedir?")).toBe(true);
    expect(sameLessonQuestion("k = 8,5 için f(6) kaçtır?", "k = 8,5 için f(3) kaçtır?")).toBe(false);
    expect(sameLessonQuestion("k = 8,5 için f(6) kaçtır?", "k = 8,5 için f(6)'nın türevi kaçtır?")).toBe(false);
    // Sayısı ve atomu olmayan iki kısa kök birbirinin tekrarı değildir.
    expect(sameLessonQuestion("Hangisi doğrudur?", "Hangisi yanlıştır?")).toBe(false);
    // Fizik: aynı sayılar, aynı birimler, başka sözcüklerle → aynı; sayısı değişen → yeni.
    expect(sameLessonQuestion("4 kg ve 12 N için ivme kaç m/s²?", "12 N, 4 kg: ivme kaçtır (m/s²)?")).toBe(true);
    expect(sameLessonQuestion("4 kg ve 12 N için ivme kaç m/s²?", "5 kg ve 20 N için ivme kaç m/s²?")).toBe(false);
  });

  it("imza: sayı çok kümesi, sembolik atomlar, içerik kökleri", () => {
    const signature = questionSignature("k = 8,5 için f(6) kaçtır?");
    expect(signature.numbers).toBe("6 8.5");
    expect([...signature.atoms].sort()).toEqual(["f", "f(6)", "k"]);
    // Sayıya bitişik kısa büyük harfli sözcük de birim sayılır ("12 KDV", "5 TL"): imzayı yalnız sıkılaştırır.
    expect([...symbolicAtoms("%12 KDV ile 5 kg, x² + 2x")].sort()).toEqual(["%12", "12kdv", "2x", "5kg", "x", "x²"]);
  });

  it("çözülmüş örneğin sorusu yeniden sorulmaz; f(3) soran yeni soru kalır", () => {
    const first = screen("Fonksiyon değeri", [
      text("Fonksiyonda değer yerine yazılır."),
      {
        type: "example",
        example: {
          prompt: "k = 8,5 için f(6) kaçtır?",
          solution: "Kurala 6 yazılır, k ile çarpılır ve sonuç bulunur.",
          steps: ["f(6) = 6 + k − 6,5", "f(6) = 8"],
          result: "8",
        },
      },
      mcq("Aynı kuralda f(4) kaçtır?"),
    ]);
    const repeat = screen("Tekrar", [text("Metin."), mcq("k=8,5 olduğunda f(6) değeri nedir?")]);
    const fresh = screen("Yeni", [text("Metin."), mcq("k = 8,5 için f(3) kaçtır?")]);
    expect(repeatedCheck([first], repeat)).toBe("k = 8,5 için f(6) kaçtır?");
    expect(repeatedCheck([first], fresh)).toBeNull();
    const out = dropRepeatedChecks([first], [repeat, fresh]);
    expect(screenCheck(out[0]!)).toBeUndefined();
    expect(screenCheck(out[1]!)?.prompt).toBe("k = 8,5 için f(3) kaçtır?");
  });
});

/* ───────────── Şema tamamlaması ───────────── */

// İktisat: dört parça tam (tanım, kural/kart, çözümlü örnek, soru), diagram_card yok → yalnız kart istenir.
const demandLesson: LessonV3 = {
  format: 3,
  title: "Talep ve Arz",
  overview: "Fiyat 10 TL'den 20 TL'ye çıkınca talep edilen miktar düşer; neden?",
  objective: "Talep ve arz eğrisinin yönünü ayırt etmek.",
  screens: [
    {
      heading: "Talep",
      concept: "Talep",
      lead: "Fiyat artınca miktar düşer",
      blocks: [
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "Fiyat yükselince talep edilen miktar da yükselir.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "Talep yasası: fiyat yükselince talep edilen miktar düşer.",
            corrected: "Fiyat yükselince talep edilen miktar düşer.",
          },
        },
        text("**Talep yasası**: fiyat yükselince talep edilen miktar düşer. Fiyat 10 TL iken 50 adet, 20 TL iken 30 adet satılır."),
        {
          type: "cards",
          cards: [
            { title: "Talep edilen miktar", body: "Belirli bir fiyatta alınmak istenen adet." },
            { title: "Talep", body: "Her fiyat için talep edilen miktarların tamamı." },
          ],
        },
        {
          type: "example",
          example: {
            prompt: "Fiyat 10 TL'den 20 TL'ye çıkarsa talep edilen miktar ne olur?",
            solution: "Talep yasasına göre miktar düşer: 50 adetten 30 adete iner.",
            result: "30 adet",
          },
        },
      ],
    },
    {
      heading: "Arz",
      concept: "Arz",
      lead: "Fiyat artınca üretici daha çok sunar",
      blocks: [
        text("**Arz yasası**: fiyat yükselince arz edilen miktar artar. Fiyat 10 TL iken 20 adet, 20 TL iken 40 adet sunulur."),
        {
          type: "table",
          table: { columns: ["Fiyat", "Talep", "Arz"], rows: [["10 TL", "50 adet", "20 adet"], ["20 TL", "30 adet", "40 adet"]] },
        },
        {
          type: "example",
          example: {
            prompt: "Fiyat 10 TL'den 20 TL'ye çıkarsa arz edilen miktar ne olur?",
            solution: "Arz yasasına göre miktar artar: 20 adetten 40 adete çıkar.",
            result: "40 adet",
          },
        },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "Fiyat 20 TL iken talep 30 adet, arz 40 adet ise piyasada ne gözlenir?",
            options: ["Arz fazlası", "Talep fazlası", "Denge", "Kıtlık"],
            answerIndex: 0,
            explanation: "Arz edilen miktar talep edilenden çok: arz fazlası oluşur ve fiyat düşme eğilimine girer.",
            optionWhy: ["40 > 30: arz fazlası.", "Talep arzdan küçük.", "Miktarlar eşit değil.", "Kıtlık talep fazlasında olur."],
            review: {
              prompt: "Fiyat 20 TL iken arz 60 adet, talep 30 adet olsaydı piyasada ne gözlenirdi?",
              options: ["Talep fazlası", "Arz fazlası", "Denge", "Kıtlık"],
              answerIndex: 1,
              explanation: "60 > 30: yine arz fazlası.",
            },
          },
        },
      ],
    },
  ],
  summary: ["Fiyat yükselince talep edilen miktar düşer.", "Fiyat yükselince arz edilen miktar artar."],
  nextFocus: [],
} as LessonV3;

// Hafif doğrulayıcı (30 Ekim 2026) kavram başına ayrı bir çağrı; bu test yalnız şema tamamlama çağrısını sayar.
const input = { topicLabel: "Talep ve arz", prepTitle: "KPSS İktisat", pages: [{ page: 3, text: "Talep yasası ve arz yasası. Fiyat 10 TL, 20 TL." }], upcomingTopics: [], sanity: false };

const card = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "diagram_card",
    diagramKind: "function_curve",
    title: "Talep eğrisi",
    caption: "Fiyat yükselince miktar düşer",
    items: [
      { label: "Fiyat 10 TL", value: "50 adet" },
      { label: "Fiyat 20 TL", value: "30 adet", highlight: true },
    ],
    afterConcept: "Arz",
    ...over,
  });

async function run(drafts: string[]) {
  const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
  const writes: { system: string; user: string }[] = [];
  const queue = [...drafts];
  const result = await teacherLessonPipeline(
    {
      write: async (system, user, onDelta) => {
        writes.push({ system, user });
        const body = queue.shift() ?? "";
        onDelta(body);
        return { text: body, finish: "stop" };
      },
    },
    input,
  );
  return { result, writes };
}

describe("Paket H · diagram_card yoksa dersi gören tek küçük tamamlama çağrısı", () => {
  it("kart afterConcept kavramının son ekranına, sorunun önüne girer; ilk kavrama konmaz", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { result, writes } = await run([JSON.stringify(demandLesson), card()]);
    expect(writes).toHaveLength(2);
    expect(writes[1]!.system).toBe(DIAGRAM_COMPLETION_SYSTEM);
    expect(writes[1]!.user).toContain("KAVRAMLAR:\n- Talep (ilk kavram — kart buraya konmaz)\n- Arz");
    expect(writes[1]!.user).toContain("KAYNAK (ilk 2500 karakter)");
    const screens = result.lesson!.screens;
    expect(screens).toHaveLength(2);
    expect(screens[0]!.blocks.some((block) => block.type === "diagram_card")).toBe(false);
    const types = screens[1]!.blocks.map((block) => block.type);
    expect(types.slice(-2)).toEqual(["diagram_card", "check"]);
    expect(info).toHaveBeenCalledWith("teacher_lesson_diagram", expect.objectContaining({ verdict: "added", kind: "function_curve", concept: "Arz" }));
    info.mockRestore();
  });

  it("bozuk JSON ya da temellenmeyen kart dersi düşürmez: ders aynen yayımlanır", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const broken = await run([JSON.stringify(demandLesson), "{ bozuk"]);
    expect(broken.writes).toHaveLength(2);
    expect(broken.result.lesson!.screens.map((screen) => screen.blocks.map((block) => block.type))).toEqual(
      demandLesson.screens.map((screen) => screen.blocks.map((block) => block.type)),
    );
    expect(info).toHaveBeenCalledWith("teacher_lesson_diagram", expect.objectContaining({ verdict: "unparsed" }));
    // Derste ya da kaynakta olmayan sayı (99 TL) kartı düşürür.
    const alien = await run([JSON.stringify(demandLesson), card({ items: [{ label: "Fiyat 99 TL", value: "50 adet" }, { label: "Fiyat 20 TL" }] })]);
    expect(alien.result.lesson!.screens.flatMap((screen) => screen.blocks).some((block) => block.type === "diagram_card")).toBe(false);
    expect(info).toHaveBeenCalledWith("teacher_lesson_diagram", expect.objectContaining({ verdict: "ungrounded" }));
    info.mockRestore();
  });

  it("yerleşim: ilk kavram istenirse son kavrama; tek kavramlı derste kart konmaz; istem ekran metnini kısaltır", () => {
    const toFirst = parseDiagramCompletion(JSON.parse(card({ afterConcept: "Talep" })), demandLesson, input);
    expect(toFirst.verdict).toBe("added");
    expect(toFirst.lesson!.screens[1]!.blocks.some((block) => block.type === "diagram_card")).toBe(true);
    const single: LessonV3 = { ...demandLesson, screens: [demandLesson.screens[1]!] };
    expect(parseDiagramCompletion(JSON.parse(card()), single, input).verdict).toBe("placement");
    expect(parseDiagramCompletion(null, demandLesson, input).verdict).toBe("unparsed");
    const prompt = diagramCompletionUserPrompt(demandLesson, { ...input, mode: "topic" });
    expect(prompt).toContain("KAYNAK: (yok");
    expect(prompt).toContain("[2] Arz (Arz):");
  });

  it("25 sn içinde dönmeyen tamamlama zaman aşımıyla düşer, ders aynen kalır", async () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { completeLessonDiagram } = await import("@/lib/learning/teacher-lesson-run");
    const pending = completeLessonDiagram({ write: () => new Promise(() => undefined) }, demandLesson, input);
    await vi.advanceTimersByTimeAsync(25_000);
    const outcome = await pending;
    expect(outcome.verdict).toBe("timeout");
    expect(outcome.lesson).toBeNull();
    info.mockRestore();
    vi.useRealTimers();
  });
});
