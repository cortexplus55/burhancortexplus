"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Question = { id: string; text: string; options: string[]; correct: string };

export function QuizRunner({
  title,
  questions,
}: {
  title: string;
  questions: Question[];
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions.length) return null;

  const correctCount = questions.filter((q) => answers[q.id] === q.correct).length;

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        {submitted ? (
          <Badge variant={correctCount === questions.length ? "default" : "secondary"}>
            {correctCount} / {questions.length} doğru
          </Badge>
        ) : null}
      </div>

      <ol className="mt-4 space-y-4">
        {questions.map((question, index) => (
          <li key={question.id}>
            <fieldset>
              <legend className="text-sm font-medium">
                {index + 1}. {question.text}
              </legend>
              <div className="mt-2 space-y-1">
                {question.options.map((option) => {
                  const selected = answers[question.id] === option;
                  const isCorrect = submitted && option === question.correct;
                  const isWrong = submitted && selected && option !== question.correct;
                  return (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                        isCorrect
                          ? "border-primary bg-accent"
                          : isWrong
                            ? "border-destructive"
                            : selected
                              ? "border-primary"
                              : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        value={option}
                        checked={selected}
                        disabled={submitted}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [question.id]: option }))
                        }
                        className="accent-[hsl(var(--primary))]"
                      />
                      {option}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={submitted || Object.keys(answers).length !== questions.length}
          onClick={() => setSubmitted(true)}
        >
          Kontrol et
        </Button>
        {submitted ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAnswers({});
              setSubmitted(false);
            }}
          >
            Tekrar dene
          </Button>
        ) : null}
      </div>
    </section>
  );
}
