"use client";

/** Doğru/yanlış: odak kartı. */
import { ScratchPad } from "@/components/parity/scratch-pad";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { TrueFalseFocusCard } from "@/components/learning/true-false-focus-card";
import { trueFalseExplanation } from "@/lib/learning/true-false-quality";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function TrueFalsePlay({ life }: { life: NodeLifecycle }) {
  const { stage, loading, payload, index, setIndex, answers, tfRevealed, setTfRevealed, finish, updateAnswer, items } = life;
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
            correct={items[index].correct}
            revealed={tfRevealed}
            // Yanlış önermede açıklama "✏️ Doğrusu: …" ile başlar; eski kayıtlar da aynı biçimde gösterilir.
            explanation={<RichBody text={trueFalseExplanation(items[index])} />}
            nextLabel={index + 1 < items.length ? "Sonraki önerme" : "Bitir"}
            onPick={(value) => {
              if (tfRevealed) return;
              updateAnswer(String(index), value);
              setTfRevealed(true);
            }}
            onNext={() => {
              if (!tfRevealed || loading) return;
              setTfRevealed(false);
              if (index + 1 < items.length) setIndex(index + 1);
              else void finish();
            }}
          />
        </section>
      ) : null}
    </>
  );
}
