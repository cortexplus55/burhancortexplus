"use client";

import { GeneratorForm } from "@/components/learning/generator-form";

export function QuizGeneratePanel({ creditCost }: { creditCost: number | null }) {
  return (
    <GeneratorForm
      variant="parity"
      endpoint="/api/learning/quiz/generate"
      fieldLabel="Konu"
      placeholder="Örn. Üslü sayılar"
      submitLabel="Quiz üret"
      creditCost={creditCost}
      returnPath="/quizler"
      buildBody={(topic) => ({ topic })}
    />
  );
}

export function FlashcardGeneratePanel({ creditCost }: { creditCost: number | null }) {
  return (
    <GeneratorForm
      variant="parity"
      endpoint="/api/learning/flashcards/generate"
      fieldLabel="Konu"
      placeholder="Örn. Türev kuralları"
      submitLabel="Kart üret"
      creditCost={creditCost}
      returnPath="/flashcardlar"
      extraFields={[
        { name: "count", label: "Kart", type: "number", defaultValue: "10" },
      ]}
      buildBody={(topic, extras) => ({
        topic,
        count: Number(extras.count ?? 10),
      })}
    />
  );
}
