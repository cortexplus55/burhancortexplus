"use client";

import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

/** Yalnız test fikstürü (E2E_FIXTURE=1): içerik sınama amaçlıdır, öğrenciye gösterilmez. */
const LESSON = {
  format: 3,
  title: "Fikstür: Konu A",
  objective: "Bileşik ifadeyi çözümlemek",
  overview: "Dar ekranda yerleşim sınaması için yazılmış ders.",
  screens: [
    {
      heading: "Bileşik ifadeyi çözümleme",
      concept: "Bileşik ifade",
      blocks: [
        { type: "text", text: "Birinci kural, iki girdiden yalnız biri işaretliyken geçerlidir. Kuralları ayırırken iki girdinin de işaretli olduğu duruma bak." },
        {
          type: "cards",
          cards: [
            { title: "Birinci terim (α)", body: "Bir kümenin her elemanında koşulun sağlandığını bildirir." },
            { title: "İkinci terim (β)", body: "Koşulu sağlayan en az bir elemanın bulunduğunu bildirir." },
          ],
        },
        {
          type: "table",
          table: {
            caption: "İki girdili kuralların sonuç tablosu",
            columns: ["X", "Y", "X ⊕ Y", "X ⊗ Y", "X ⊙ Y YA", "X → Y", "X ↔ Y"],
            rows: [
              ["1", "1", "1", "1", "0", "1", "1"],
              ["1", "0", "0", "1", "1", "0", "0"],
              ["0", "1", "0", "1", "1", "1", "0"],
              ["0", "0", "0", "0", "0", "1", "1"],
            ],
          },
        },
        {
          type: "diagram_card",
          diagramKind: "process_network",
          title: "Bileşik ifadeyi çözümleme",
          items: [
            { label: "Girdileri belirle", detail: "X ve Y değerlerini ayır" },
            { label: "Kuralı belirle", detail: "⊕, ⊗ ya da ⊙" },
            { label: "Kuralı uygula", detail: "Girdilerin değerlerini kullan" },
            { label: "Bileşik ifadenin değerini bul", highlight: true },
          ],
        },
      ],
    },
    {
      heading: "Öteki blok türleri",
      concept: "Kural B",
      blocks: [
        { type: "text", text: "Kural B, yalnız X = 1 ve Y = 0 iken 0 verir." },
        { type: "formula", formula: { title: "Kural B'nin eşdeğeri", expression: "X → Y ≡ f(X, Y)", symbols: [{ symbol: "f", meaning: "örnek işlev" }, { symbol: "≡", meaning: "eşdeğer" }] } },
        { type: "note", note: { title: "Dikkat", body: "Girdilerin yeri değişince sonuç değişebilir." } },
        { type: "exam_trap_card", trap: { title: "Yer değiştirme denk değildir", wrong: "Y → X, X → Y ile aynıdır.", right: "Yalnız tablo aynıysa denktir." } },
        { type: "memory_hook_card", hook: { kind: "shortcut", title: "Tek sıfır satırı", body: "1'den 0'a giden ok 0 verir." } },
        {
          type: "comparison_carousel",
          carousel: {
            mode: "compare",
            title: "Birinci, ikinci, üçüncü biçim",
            slides: [
              { title: "Birinci biçimin uzun başlığı", body: "Y → X biçimindedir." },
              { title: "İkinci biçim", body: "g(X) → g(Y) biçimindedir." },
              { title: "Üçüncü biçim", body: "g(Y) → g(X) biçimindedir; özgün ifadeye denktir." },
            ],
          },
        },
        { type: "example", example: { prompt: "X = 1, Y = 0 ise X → Y nedir?", steps: ["Birinci girdi 1, ikinci 0."], solution: "0'dır." } },
      ],
    },
  ],
  summary: ["Kural, bileşik ifadenin sonucunu belirler."],
} as unknown as LessonV3;

export function DersMobilFixture() {
  return <ExamLessonSteps lesson={sealLessonV3ForPlay(LESSON)} closeHref="/" />;
}
