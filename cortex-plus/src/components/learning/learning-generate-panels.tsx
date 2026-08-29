"use client";

import { GeneratorForm } from "@/components/learning/generator-form";

export function QuizGeneratePanel({ creditCost }: { creditCost: number | null }) {
  return (
    <GeneratorForm
      variant="astra"
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
      variant="astra"
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

export function StudyPlanGeneratePanel({ creditCost }: { creditCost: number | null }) {
  return (
    <GeneratorForm
      variant="astra"
      endpoint="/api/learning/study-plan/generate"
      fieldLabel="Hedef"
      placeholder="Örn. 4 haftada türev konusunu bitirmek"
      submitLabel="Plan üret"
      creditCost={creditCost}
      returnPath="/calisma-plani"
      extraFields={[
        { name: "weeks", label: "Hafta", type: "number", defaultValue: "4" },
        { name: "hoursPerWeek", label: "Saat/hafta", type: "number", defaultValue: "8" },
      ]}
      buildBody={(goal, extras) => ({
        goal,
        weeks: Number(extras.weeks ?? 4),
        hoursPerWeek: Number(extras.hoursPerWeek ?? 8),
      })}
    />
  );
}

export function ExamGeneratePanel({ creditCost }: { creditCost: number | null }) {
  return (
    <GeneratorForm
      endpoint="/api/learning/exam/generate"
      fieldLabel="Konu"
      placeholder="Örn. Fonksiyonlar"
      submitLabel="Deneme üret"
      creditCost={creditCost}
      returnPath="/deneme-sinavlari"
      extraFields={[
        {
          name: "questionCount",
          label: "Soru",
          type: "number",
          defaultValue: "10",
        },
      ]}
      buildBody={(topic, extras) => ({
        topic,
        questionCount: Number(extras.questionCount ?? 10),
        difficulty: "medium",
      })}
    />
  );
}
