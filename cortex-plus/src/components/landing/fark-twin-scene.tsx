"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { TWIN_SCENE, twinSceneEliminatedLine, twinSceneHint, type TwinDemoQuestion } from "@/lib/marketing/fark-accordion";
import { cn } from "@/lib/utils";

/**
 * Akordeonun 4. sahnesi (Faz 9, 20 Kasım 2026): "Tuzak yakalandı → Yanlışın ikizi hazır". Üründeki iki parçanın kayıtsız,
 * istek atmayan hâli: "🤔 İki Şık Arasında Kaldım" (iki şık seçilir, cevabı söylemeyen ipucu gelir, dışarıdan bir çeldirici
 * elenir) ve yanlış cevaptan sonra "🔥 Yanlışın İkiziyle Anında Telafi Et" (aynı kavram, sayıları değişmiş tek soru).
 * Düğme adları ürünün kendi sabitlerinden (`twin-question-copy.ts`). Veri hazır, notlandırma tarayıcıda; model,
 * yıldız ve kredi yok. Ürünün bileşenleri (ve onların ağır ders stili) ana sayfanın ilk yüküne bilerek alınmadı.
 */

type Phase = "ask" | "twin";

const letter = (at: number) => String.fromCharCode(65 + at);

function Options({
  question,
  picked,
  eliminated,
  onPick,
}: {
  question: TwinDemoQuestion;
  picked: string | null;
  eliminated: string | null;
  onPick: (option: string) => void;
}) {
  const locked = picked !== null;
  return (
    <ol className="fk-twin-opts">
      {question.options.map((option, at) => {
        const right = locked && option === question.answer;
        const wrong = locked && option === picked && option !== question.answer;
        const gone = option === eliminated;
        // Durum renkle değil, düğmenin adıyla da söylenir (gizli metin yazı katmanında üst üste biner; ad binmez).
        const state = right ? " · doğru cevap" : wrong ? " · senin cevabın, yanlış" : gone ? " · elendi" : "";
        return (
          <li key={option}>
            <button
              type="button"
              className={cn("fk-twin-opt", right && "is-right", wrong && "is-wrong", gone && "is-gone")}
              disabled={locked || gone}
              aria-pressed={picked === option}
              aria-label={`${letter(at)}) ${option}${state}`}
              onClick={() => onPick(option)}
            >
              <span className="fk-opt-letter" aria-hidden>
                {letter(at)}
              </span>
              <span className="fk-twin-opt-text">{option}</span>
              {right ? <Check className="fk-opt-mark" strokeWidth={3} aria-hidden /> : null}
              {wrong ? <X className="fk-opt-mark" strokeWidth={3} aria-hidden /> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Dokunulan düğme kaybolunca (şık kilitlenir, ipucu gelir, aşama değişir) odak yeni içeriğin başına taşınır. */
type FocusTarget = "prompt" | "result" | "hint";

export function TwinScene() {
  const [phase, setPhase] = useState<Phase>("ask");
  const [picked, setPicked] = useState<string | null>(null);
  const [twinPicked, setTwinPicked] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [pair, setPair] = useState<string[]>([]);
  const focusNext = useRef<FocusTarget | null>(null);
  const promptRef = useRef<HTMLParagraphElement | null>(null);
  const resultRef = useRef<HTMLParagraphElement | null>(null);
  const hintRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (target === "prompt") promptRef.current?.focus();
    if (target === "result") resultRef.current?.focus();
    if (target === "hint") hintRef.current?.focus();
  });

  const main: TwinDemoQuestion = TWIN_SCENE.question;
  const twin: TwinDemoQuestion = TWIN_SCENE.twin;
  const hint = pair.length === 2 ? twinSceneHint(main, pair) : null;
  const mainRight = picked === main.answer;
  const twinRight = twinPicked === twin.answer;

  function pickMain(option: string) {
    focusNext.current = "result";
    setPicked(option);
  }

  function pickTwin(option: string) {
    focusNext.current = "result";
    setTwinPicked(option);
  }

  function togglePair(option: string) {
    if (pair.length === 2) return;
    const next = pair.includes(option) ? pair.filter((item) => item !== option) : [...pair, option];
    if (next.length === 2) focusNext.current = "hint";
    setPair(next);
  }

  function goTwin() {
    focusNext.current = "prompt";
    setPhase("twin");
  }

  function restart() {
    focusNext.current = "prompt";
    setPhase("ask");
    setPicked(null);
    setTwinPicked(null);
    setHintOpen(false);
    setPair([]);
  }

  return (
    <article className="fk-card fk-twin" aria-label={TWIN_SCENE.steps.join(" → ")} data-testid="twin-scene" data-phase={phase}>
      <ol className="fk-steps">
        {TWIN_SCENE.steps.map((step, at) => {
          const current = (phase === "ask" ? 0 : 1) === at;
          const done = phase === "twin" && at === 0;
          return (
            <li key={step} className={cn("fk-step", current && "is-current", done && "is-done")} aria-current={current ? "step" : undefined}>
              <span className="fk-step-num" aria-hidden>
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : at + 1}
              </span>
              {step}
            </li>
          );
        })}
      </ol>

      {phase === "ask" ? (
        <div className="fk-twin-body">
          <p className="fk-q-text" ref={promptRef} tabIndex={-1}>
            {main.prompt}
          </p>
          <Options question={main} picked={picked} eliminated={hint?.eliminated ?? null} onPick={pickMain} />

          {picked === null ? (
            hintOpen ? (
              <div className="fk-two" role="group" aria-label={TWIN_SCENE.chip}>
                {hint ? (
                  <div data-testid="twin-scene-hint">
                    <p className="fk-two-hint" ref={hintRef} tabIndex={-1}>
                      💡 {hint.hint}
                    </p>
                    {hint.eliminated ? <p className="fk-two-out">{twinSceneEliminatedLine(main, hint.eliminated)}</p> : null}
                  </div>
                ) : (
                  <>
                    <p className="fk-two-title">{TWIN_SCENE.pick}</p>
                    <div className="fk-two-letters">
                      {main.options.map((option, at) => (
                        <button
                          key={option}
                          type="button"
                          className={cn("fk-two-letter", pair.includes(option) && "is-on")}
                          aria-pressed={pair.includes(option)}
                          aria-label={`${letter(at)} şıkkı: ${option}`}
                          onClick={() => togglePair(option)}
                        >
                          {letter(at)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button type="button" className="fk-chip" onClick={() => setHintOpen(true)} data-testid="twin-scene-chip">
                {TWIN_SCENE.chip}
              </button>
            )
          ) : (
            <div className={cn("fk-result", mainRight ? "is-right" : "is-wrong")} data-testid="twin-scene-result">
              <p className="fk-result-head" ref={resultRef} tabIndex={-1}>
                {mainRight ? TWIN_SCENE.right : TWIN_SCENE.trapCaught}
              </p>
              {mainRight ? null : <p className="fk-result-why">{main.whyWrong[picked] ?? ""}</p>}
              <p className="fk-result-exp">{main.explanation}</p>
              {mainRight ? <p className="fk-fine">{TWIN_SCENE.rightTwinOffer}</p> : null}
              <button type="button" className="fk-twin-go" onClick={goTwin} data-testid="twin-scene-go">
                {TWIN_SCENE.twinButton}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="fk-twin-body">
          <p className="fk-q-text" ref={promptRef} tabIndex={-1}>
            {twin.prompt}
          </p>
          <Options question={twin} picked={twinPicked} eliminated={null} onPick={pickTwin} />
          {twinPicked === null ? null : (
            <div className={cn("fk-result", twinRight ? "is-right" : "is-wrong")} data-testid="twin-scene-result">
              <p className="fk-result-head" ref={resultRef} tabIndex={-1}>
                {twinRight ? TWIN_SCENE.twinRight : TWIN_SCENE.twinWrong}
              </p>
              {twinRight ? null : <p className="fk-result-why">{twin.whyWrong[twinPicked] ?? ""}</p>}
              <p className="fk-result-exp">{twin.explanation}</p>
              <button type="button" className="fk-twin-again" onClick={restart}>
                {TWIN_SCENE.restart}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
