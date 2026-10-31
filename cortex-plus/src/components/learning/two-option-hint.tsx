"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { TWO_OPTION_CHIP, TWO_OPTION_FALLBACK, TWO_OPTION_PICK } from "@/lib/learning/twin-question-copy";
import "@/styles/twin-question.css";

/**
 * "🤔 İki şık arasında kaldım" (31 Ekim 2026, Paket J3 #12): cevap kilitlenmeden önce. Öğrenci iki şıkka dokunur;
 * sunucu ikisi arasındaki kavramsal farkı tek cümleyle hatırlatır, cevabı söylemez. İpucu alınan soru bağımsız başarı
 * sayılmaz (`onUsed` → `markHint`).
 */
export function TwoOptionHint({
  attemptId,
  index,
  options,
  onUsed,
}: {
  attemptId: string;
  index: number;
  options: string[];
  onUsed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function ask(next: string[]) {
    setLoading(true);
    onUsed?.();
    try {
      const response = await fetch("/api/learning/two-option-hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, index, options: next }),
      });
      const data = (await response.json().catch(() => ({}))) as { hint?: string };
      setHint(response.ok && data.hint ? data.hint : TWO_OPTION_FALLBACK);
    } catch {
      setHint(TWO_OPTION_FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  function toggle(option: string) {
    if (loading || hint) return;
    const next = pair.includes(option) ? pair.filter((item) => item !== option) : [...pair, option].slice(-2);
    setPair(next);
    if (next.length === 2) void ask(next);
  }

  if (!open) {
    return (
      <button type="button" className="cp-two-chip" onClick={() => setOpen(true)}>
        {TWO_OPTION_CHIP}
      </button>
    );
  }

  return (
    <div className="cp-two" role="group" aria-label={TWO_OPTION_CHIP}>
      {hint ? (
        <p className="cp-two-hint" role="status" aria-live="polite">
          💡 <RichBody text={hint} />
        </p>
      ) : (
        <>
          <p className="cp-two-title">{TWO_OPTION_PICK}</p>
          <div className="cp-two-options">
            {options.map((option, optionIndex) => (
              <button
                key={option}
                type="button"
                aria-pressed={pair.includes(option)}
                className={`cp-two-option ${pair.includes(option) ? "is-on" : ""}`}
                onClick={() => toggle(option)}
                disabled={loading}
              >
                {String.fromCharCode(65 + optionIndex)}
              </button>
            ))}
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="İpucu hazırlanıyor" /> : null}
          </div>
        </>
      )}
    </div>
  );
}
