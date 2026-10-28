"use client";

import { useEffect, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "@/styles/true-false-focus.css";

/**
 * Doğru/yanlış klavye akışı (28 Ekim 2026): ← ya da D "Doğru", → ya da Y "Yanlış"; cevaptan sonra
 * Enter, boşluk ya da → sonraki önerme. Yazı alanındayken (karalama defteri) tuşlar dinlenmez.
 */
export function useTrueFalseKeys(input: {
  active: boolean;
  revealed: boolean;
  onPick: (value: boolean) => void;
  onNext: () => void;
}) {
  const { active, revealed, onPick, onNext } = input;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = event.key.toLocaleLowerCase("tr");
      if (!revealed) {
        if (key === "arrowleft" || key === "d") {
          event.preventDefault();
          onPick(true);
        } else if (key === "arrowright" || key === "y") {
          event.preventDefault();
          onPick(false);
        }
        return;
      }
      if (key === "enter" || key === " " || key === "arrowright") {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, revealed, onPick, onNext]);
}

/** Hazırlık yolundaki doğru/yanlış: tek önerme, geniş kart, tek dokunuşla cevap. */
export function TrueFalseFocusCard({
  index,
  total,
  statement,
  picked,
  correct,
  revealed,
  explanation,
  nextLabel,
  onPick,
  onNext,
}: {
  index: number;
  total: number;
  statement: ReactNode;
  picked: boolean | null;
  correct: boolean;
  revealed: boolean;
  explanation: ReactNode;
  nextLabel: string;
  onPick: (value: boolean) => void;
  onNext: () => void;
}) {
  useTrueFalseKeys({ active: true, revealed, onPick, onNext });
  const right = picked === correct;
  return (
    <section className="tf-focus" aria-labelledby="tf-focus-statement">
      <p className="tf-focus-count">
        Önerme {index + 1} / {total}
      </p>
      <div className="tf-focus-card">
        <div id="tf-focus-statement" className="tf-focus-statement">
          {statement}
        </div>
      </div>
      <div className="tf-focus-choices" role="group" aria-label="Cevabın">
        {([true, false] as const).map((value) => (
          <button
            key={String(value)}
            type="button"
            disabled={revealed}
            aria-pressed={picked === value}
            className={cn(
              "tf-focus-choice",
              value ? "tf-focus-choice--yes" : "tf-focus-choice--no",
              picked === value && "is-picked",
              revealed && correct === value && "is-correct",
              revealed && picked === value && correct !== value && "is-wrong",
            )}
            onClick={() => onPick(value)}
          >
            {value ? <Check className="h-7 w-7" aria-hidden /> : <X className="h-7 w-7" aria-hidden />}
            <span>{value ? "Doğru" : "Yanlış"}</span>
            <kbd aria-hidden>{value ? "←" : "→"}</kbd>
          </button>
        ))}
      </div>
      {revealed ? (
        <div className={cn("tf-focus-feedback", right ? "is-right" : "is-off")} role="status">
          <p className="tf-focus-verdict">{right ? "✓ Doğru bildin" : "✕ Bu sefer olmadı"}</p>
          <div className="tf-focus-explain">{explanation}</div>
          <button type="button" className="tf-focus-next" onClick={onNext}>
            {nextLabel}
            <kbd aria-hidden>Enter</kbd>
          </button>
        </div>
      ) : (
        <p className="tf-focus-hint">Dokun ya da klavyede ← Doğru · → Yanlış</p>
      )}
    </section>
  );
}
