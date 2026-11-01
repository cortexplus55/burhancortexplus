"use client";

import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

/** Yalnız test fikstürü (E2E_FIXTURE=1): içerik sınama amaçlıdır, öğrenciye gösterilmez. */
const LESSON = {
  format: 3,
  title: "Fikstür: Önermeler",
  objective: "Bileşik önermeyi çözümlemek",
  overview: "Dar ekranda yerleşim sınaması için yazılmış ders.",
  screens: [
    {
      heading: "Bileşik önermeyi çözümleme",
      concept: "Bileşik önerme",
      blocks: [
        { type: "text", text: "Ya da (özel veya), önermelerden yalnız biri doğruyken doğrudur. Bu üç bağlacı ayırırken ikisinin de doğru olduğu duruma bak." },
        {
          type: "cards",
          cards: [
            { title: "Evrensel niceleyici (∀)", body: "Bir kümenin her elemanında koşulun sağlandığını bildirir." },
            { title: "Varlıksal niceleyici (∃)", body: "Koşulu sağlayan en az bir elemanın bulunduğunu bildirir." },
          ],
        },
        {
          type: "table",
          table: {
            caption: "İki önermeli bağlaçların doğruluk koşulları",
            columns: ["P", "Q", "P ∧ Q", "P ∨ Q", "P YA DA Q", "P ⇒ Q", "P ⇔ Q"],
            rows: [
              ["D", "D", "D", "D", "Y", "D", "D"],
              ["D", "Y", "Y", "D", "D", "Y", "Y"],
              ["Y", "D", "Y", "D", "D", "D", "Y"],
              ["Y", "Y", "Y", "Y", "Y", "D", "D"],
            ],
          },
        },
        {
          type: "diagram_card",
          diagramKind: "process_network",
          title: "Bileşik önermeyi çözümleme",
          items: [
            { label: "Önermeleri belirle", detail: "P ve q ifadelerini ayır" },
            { label: "Bağlacı belirle", detail: "∧, ∨ ya da ya da" },
            { label: "Doğruluk koşulunu uygula", detail: "İfadelerin doğruluk değerlerini kullan" },
            { label: "Bileşik önermenin değerini bul", highlight: true },
          ],
        },
      ],
    },
    {
      heading: "Öteki blok türleri",
      concept: "Koşullu önerme",
      blocks: [
        { type: "text", text: "Koşullu önerme p ⇒ q yalnız p doğru, q yanlışken yanlıştır." },
        { type: "formula", formula: { title: "Koşullu önermenin eşdeğeri", expression: "p ⇒ q ≡ ¬p ∨ q", symbols: [{ symbol: "¬", meaning: "değil" }, { symbol: "∨", meaning: "veya" }] } },
        { type: "note", note: { title: "Dikkat", body: "Karşıt ters önerme ¬q ⇒ ¬p, koşullu önermeye denktir." } },
        { type: "exam_trap_card", trap: { title: "Ters önerme denk değildir", wrong: "q ⇒ p, p ⇒ q ile aynıdır.", right: "Yalnız ¬q ⇒ ¬p denktir." } },
        { type: "memory_hook_card", hook: { kind: "shortcut", title: "Tek yanlış satır", body: "Doğrudan yanlışa giden ok yanlıştır." } },
        {
          type: "comparison_carousel",
          carousel: {
            mode: "compare",
            title: "Ters, karşıt, karşıt ters",
            slides: [
              { title: "Ters önermesinin uzun başlığı", body: "q ⇒ p biçimindedir." },
              { title: "Karşıt önerme", body: "¬p ⇒ ¬q biçimindedir." },
              { title: "Karşıt ters önerme", body: "¬q ⇒ ¬p biçimindedir; özgün önermeye denktir." },
            ],
          },
        },
        { type: "example", example: { prompt: "p doğru, q yanlışsa p ⇒ q nedir?", steps: ["Öncül doğru, sonuç yanlış."], solution: "Yanlıştır." } },
      ],
    },
  ],
  summary: ["Bağlaç, bileşik önermenin doğruluk koşulunu belirler."],
} as unknown as LessonV3;

export function DersMobilFixture() {
  return <ExamLessonSteps lesson={sealLessonV3ForPlay(LESSON)} closeHref="/" />;
}
