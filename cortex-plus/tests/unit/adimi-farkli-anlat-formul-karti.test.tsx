// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { ExamLessonSteps, type ReexplainHandler } from "@/components/parity/exam-lesson-steps";
import { equationsWithoutCard, lessonKeyFacts, sourceEquations, sourceEquationsBlock } from "@/lib/learning/lesson-key-facts";
import { plainStepText, REEXPLAIN_RULE, reexplainUserPrompt } from "@/lib/learning/step-reexplain";
import { coverageGapCount } from "@/lib/learning/teacher-lesson";

/*
  10 Kasım 2026, canlı denetim: ders adımlarında "Farklı anlat" yoktu (yalnız ders sonunda, bütün dersi yeniden
  yazdıran düğme); kısa bir notun açık formülü derste yalnız sözle tarif edildi. Örnekler farklı derslerden.
*/

Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function lessonWith(section: Partial<LessonV2["sections"][number]> = {}): LessonV2 {
  return {
    title: "Mol Kütlesi",
    sections: [
      {
        heading: "Mol Kütlesi",
        body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Her maddenin mol kütlesi farklıdır.",
        ...section,
      },
      { heading: "Mol Sayısı", body: "Mol sayısı, kütlenin mol kütlesine bölünmesiyle bulunur ve tanecik sayısını verir." },
    ],
  };
}

describe("adımı farklı anlat", () => {
  it("anlatım adımının altında düğme var; basınca farklı anlatım adımın altına eklenir", async () => {
    const handler = vi.fn<ReexplainHandler>(async () => ({ reply: "Bir düzine yumurta gibi düşün. Kısaca: mol bir sayma birimidir." }));
    render(<ExamLessonSteps lesson={lessonWith()} closeHref="/deneme-sinavlari/p" onReexplain={handler} />);
    fireEvent.click(screen.getByRole("button", { name: /Devam et|Başla/ }));
    const button = await screen.findByRole("button", { name: "🔄 Farklı anlat" });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText(/Bir düzine yumurta gibi düşün/)).toBeTruthy());
    expect(handler).toHaveBeenCalledTimes(1);
    const input = handler.mock.calls[0]![0];
    expect(input.heading).toBe("Mol Kütlesi");
    expect(input.text).toContain("bir mol maddenin gram cinsinden kütlesidir");
    expect(input.previous).toEqual([]);
    // İkinci basışta önceki anlatım isteğe eklenir: yenisi onu tekrar etmesin.
    fireEvent.click(screen.getByRole("button", { name: "🔄 Bir kez daha farklı anlat" }));
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    expect(handler.mock.calls[1]![0].previous).toHaveLength(1);
  });

  it("hata öğrenciye kısa cümleyle yazılır, ders akışı durmaz; işleyici yoksa düğme yok", async () => {
    const failing = vi.fn<ReexplainHandler>(async () => ({ error: "Bu sefer anlatılamadı. Tekrar dene." }));
    const { unmount } = render(<ExamLessonSteps lesson={lessonWith()} closeHref="/p" onReexplain={failing} />);
    fireEvent.click(screen.getByRole("button", { name: /Devam et|Başla/ }));
    fireEvent.click(await screen.findByRole("button", { name: "🔄 Farklı anlat" }));
    await waitFor(() => expect(screen.getByText("Bu sefer anlatılamadı. Tekrar dene.")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Devam et/ })).toBeTruthy();
    unmount();

    render(<ExamLessonSteps lesson={lessonWith()} closeHref="/p" />);
    fireEvent.click(screen.getByRole("button", { name: /Devam et|Başla/ }));
    expect(screen.queryByRole("button", { name: "🔄 Farklı anlat" })).toBeNull();
  });

  it("önce dene ekranında düğme cevaptan önce görünmez (anlatım cevabı verir)", async () => {
    const handler = vi.fn<ReexplainHandler>(async () => ({ reply: "x" }));
    render(
      <ExamLessonSteps
        lesson={lessonWith({
          checkFirst: true,
          check: { type: "trueFalse", prompt: "Mol kütlesi her zaman aynıdır.", options: ["Doğru", "Yanlış"], answerIndex: 1, explanation: "Madde değişince değişir." },
        })}
        closeHref="/p"
        onReexplain={handler}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Devam et|Başla/ }));
    expect(screen.queryByRole("button", { name: "🔄 Farklı anlat" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Yanlış/ }));
    expect(await screen.findByRole("button", { name: "🔄 Farklı anlat" })).toBeTruthy();
  });

  it("istem yeni bilgi eklemeyi yasaklar, adımın sayılarını korur; biçim işaretleri modele gitmez", () => {
    expect(REEXPLAIN_RULE).toContain("Yeni olgu, sayı, eşik, tarih, sınıflandırma ya da formül EKLEME");
    expect(REEXPLAIN_RULE).toContain("FARKLI bir yoldan");
    const prompt = reexplainUserPrompt({
      prepTitle: "Kimya Yazılısı",
      topicLabel: "Mol Kavramı",
      heading: "Mol Kütlesi",
      text: "**Mol kütlesi** ==gram cinsinden== ölçülür.",
      previous: ["Bir düzine yumurta gibi düşün."],
    });
    expect(prompt).toContain("ADIMIN İLK ANLATIMI:\nMol kütlesi gram cinsinden ölçülür.");
    expect(prompt).toContain("DAHA ÖNCE VERİLEN FARKLI ANLATIMLAR");
    expect(plainStepText("a".repeat(5000)).length).toBe(2400);
  });

  it("uç: sahiplik doğrulanır, ders içi yardım sayacı kullanılır; istek yaşam döngüsü kancasında", () => {
    const route = read("src/app/api/learning/exam-prep/reexplain/route.ts");
    expect(route).toContain('.eq("user_id", userId)');
    expect(route).toContain('.eq("exam_prep_id", parsed.data.prepId)');
    expect(route).toContain('freeMeter: "included"');
    expect(route).toContain("studentOutputText(outcome.data.reply)");
    // Rota dosyası yalnız HTTP metodunu dışa aktarır.
    expect(route.match(/^export /gm)).toHaveLength(1);
    const hook = read("src/components/parity/exam-node/use-node-lifecycle.ts");
    expect(hook).toContain('fetch("/api/learning/exam-prep/reexplain"');
    expect(read("src/components/parity/exam-node/lesson.tsx")).toContain("onReexplain={reexplainStep}");
    // Çizim bileşeni istek atmaz.
    expect(read("src/components/parity/exam-lesson-steps.tsx")).not.toContain("/api/learning/exam-prep/reexplain");
  });

  it("düğme dokunma ölçüsünde ve renkleri token'dan", () => {
    const css = read("src/styles/exam-lesson-steps.css");
    expect(css).toMatch(/\.als-reexplain-btn \{[^}]*min-height: 2\.75rem/);
    expect(css).toMatch(/\.als-reexplain-btn \{[^}]*max-width: 100%/);
    expect(css).toMatch(/\.als-reexplain-box \{[^}]*overflow-wrap: anywhere/);
  });
});

describe("kaynaktaki açık formül formül kartında gösterilir", () => {
  const pages = [
    {
      text: [
        "Yoğunluk",
        "Yoğunluk, birim hacimdeki madde miktarıdır.",
        "d = m / V",
        "Sınav toplam = 100 puan",
        "Hız bağıntısı: v = x / t",
      ].join("\n"),
    },
  ];
  const facts = lessonKeyFacts(pages);

  it("denklem: iki yanında harf, sağ yanında işlem; atama satırı denklem değildir", () => {
    const equations = sourceEquations(facts).map((fact) => fact.text);
    expect(equations.some((text) => text.includes("d = m / V"))).toBe(true);
    expect(equations.some((text) => text.includes("100 puan"))).toBe(false);
    expect(sourceEquationsBlock(facts)).toContain("'formula' bloğunda");
    expect(sourceEquationsBlock([])).toBe("");
  });

  it("formülü yalnız sözle anlatan ders açık sayılır; kartta gösteren (LaTeX yazımıyla da) sayılmaz", () => {
    const verbal = [{ heading: "Yoğunluk", blocks: [{ type: "text", text: "Yoğunluk kütlenin hacme bölümüdür; d = m / V diye yazılır." }] }];
    expect(equationsWithoutCard(verbal, facts).some((fact) => fact.text.includes("d = m / V"))).toBe(true);

    const carded = [
      {
        heading: "Yoğunluk",
        blocks: [
          { type: "text", text: "Yoğunluk kütlenin hacme bölümüdür." },
          { type: "formula", formula: { expression: "d = \\frac{m}{V}" } },
          { type: "formula", formula: { expression: "v = x / t" } },
        ],
      },
    ];
    expect(equationsWithoutCard(carded, facts)).toEqual([]);
  });

  it("kartsız formül kapsam açığıdır: tamamlama çağrısı formül bloğunu ister", () => {
    expect(coverageGapCount({ headings: [], facts: [], formulas: ["d = m / V"] })).toBe(1);
    expect(coverageGapCount({ headings: [], facts: [] })).toBe(0);
    const lesson = read("src/lib/learning/teacher-lesson.ts");
    expect(lesson).toContain("formulas: equationsWithoutCard(lesson.screens, facts).slice(0, 3).map((fact) => fact.text)");
    expect(lesson).toContain("- Formül (bir 'formula' bloğunda, kaynaktaki yazımıyla göster): ");
    expect(lesson).toContain("sourceEquationsBlock(lessonFacts(input.pages, input.noteWarnings))");
  });
});
