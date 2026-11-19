"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { TWO_OPTION_CHIP, TWO_OPTION_FALLBACK, TWO_OPTION_PICK, twoOptionEliminatedLine } from "@/lib/learning/twin-question-copy";
import "@/styles/twin-question.css";

/**
 * "🤔 İki şık arasında kaldım" (31 Ekim 2026, Paket J3 #12): cevap kilitlenmeden önce. Öğrenci iki şıkka dokunur;
 * sunucu ikisi arasındaki kavramsal farkı tek cümleyle hatırlatır, cevabı söylemez. İpucu alınan soru bağımsız başarı
 * sayılmaz (`onUsed` → `markHint`).
 *
 * `resolve` (11 Kasım 2026): ipucunu sunucu yerine çağıranın verdiği işlev üretir. Ana sayfadaki tanıtım turu aynı
 * bileşeni örnek veriyle, istek atmadan kullanır; ürün içinde verilmez ve davranış değişmez.
 *
 * Faz 5 §3.1 (19 Kasım 2026): ipucuyla birlikte bir çeldirici elenir. Sunucu (ya da `resolve`) seçilen iki şıkkın
 * dışından, doğru olmayan bir şıkkı döner; `onEliminate` onu şıklarda üstü çizili ve seçilemez yapar.
 */
export type TwoOptionResolved = string | { hint: string | null; eliminated?: string | null } | null;

export function TwoOptionHint({
  attemptId,
  index,
  options,
  onUsed,
  onEliminate,
  resolve,
}: {
  attemptId: string;
  index: number;
  options: string[];
  onUsed?: () => void;
  onEliminate?: (option: string) => void;
  resolve?: (pair: string[]) => TwoOptionResolved | Promise<TwoOptionResolved>;
}) {
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [eliminated, setEliminated] = useState<string | null>(null);

  function eliminate(option: string | null | undefined) {
    if (!option || !options.includes(option)) return;
    setEliminated(option);
    onEliminate?.(option);
  }

  async function ask(next: string[]) {
    setLoading(true);
    onUsed?.();
    try {
      if (resolve) {
        const out = await resolve(next);
        if (out && typeof out === "object") {
          setHint(out.hint || TWO_OPTION_FALLBACK);
          eliminate(out.eliminated);
        } else {
          setHint(out || TWO_OPTION_FALLBACK);
        }
        return;
      }
      const response = await fetch("/api/learning/two-option-hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, index, options: next }),
      });
      const data = (await response.json().catch(() => ({}))) as { hint?: string; eliminated?: string | null };
      setHint(response.ok && data.hint ? data.hint : TWO_OPTION_FALLBACK);
      if (response.ok) eliminate(data.eliminated);
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
      <button type="button" className="cp-two-chip" data-testid="two-option-chip" onClick={() => setOpen(true)}>
        {TWO_OPTION_CHIP}
      </button>
    );
  }

  return (
    <div className="cp-two" role="group" aria-label={TWO_OPTION_CHIP}>
      {hint ? (
        <div role="status" aria-live="polite">
          <p className="cp-two-hint">
            💡 <RichBody text={hint} />
          </p>
          {eliminated ? (
            <p className="cp-two-eliminated" data-testid="two-option-eliminated">
              {twoOptionEliminatedLine(String.fromCharCode(65 + options.indexOf(eliminated)))}
            </p>
          ) : null}
        </div>
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
