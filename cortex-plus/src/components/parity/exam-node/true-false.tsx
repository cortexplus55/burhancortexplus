"use client";

/** Doğru/yanlış: odak kartı. */
import { ScratchPad } from "@/components/parity/scratch-pad";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { TrueFalseFocusCard } from "@/components/learning/true-false-focus-card";
import { trueFalseExplanation } from "@/lib/learning/true-false-quality";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function TrueFalsePlay({ life }: { life: NodeLifecycle }) {
  const { stage, loading, payload, index, setIndex, answers, tfRevealed, setTfRevealed, finish, pickTrueFalse, answerCheckError, items, mood } = life;
  // Koç katmanı (7 Kasım 2026): bu önermeden önceki art arda doğrular.
  let streakBefore = 0;
  for (let at = index - 1; at >= 0; at -= 1) {
    if (answers[String(at)] !== items[at]?.correct) break;
    streakBefore += 1;
  }
  return (
    <>
      {stage === "play" && payload.type === "true_false" && items[index] ? (
        <section>
          <ScratchPad />
          {/* Odak kartı (28 Ekim 2026): geniş önerme, tek dokunuşla cevap, ← / → / Enter klavye akışı. */}
          <TrueFalseFocusCard
            index={index}
            total={items.length}
            statement={<RichBody text={items[index].text} />}
            picked={typeof answers[String(index)] === "boolean" ? (answers[String(index)] as boolean) : null}
            correct={items[index].correct === true}
            revealed={tfRevealed}
            // Yanlış önermede açıklama "✏️ Doğrusu: …" ile başlar; eski kayıtlar da aynı biçimde gösterilir.
            explanation={<RichBody text={trueFalseExplanation({ ...items[index], correct: items[index].correct === true, explanation: items[index].explanation ?? "" })} />}
            nextLabel={index + 1 < items.length ? "Sonraki önerme" : "Bitir"}
            streakBefore={streakBefore}
            mood={mood}
            onPick={(value) => {
              if (tfRevealed || loading) return;
              void pickTrueFalse(index, value);
            }}
            onNext={() => {
              if (!tfRevealed || loading) return;
              setTfRevealed(false);
              if (index + 1 < items.length) setIndex(index + 1);
              else void finish();
            }}
          />
          {answerCheckError ? (
            <p role="alert" className="mt-2 text-sm text-[var(--pm-danger,#ef4444)]">
              {answerCheckError}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
