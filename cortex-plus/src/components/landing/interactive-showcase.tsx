"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { AudienceTabs } from "@/components/landing/audience-tabs";
import { coachReaction } from "@/lib/learning/coach-reactions";
import { TWO_OPTION_CHIP } from "@/lib/learning/twin-question-copy";
import {
  audienceSegment,
  bridgeCtaLabel,
  SHOWCASE,
  SHOWCASE_COPY,
  type AudienceSegmentId,
} from "@/lib/marketing/landing-showcase";
import { cn } from "@/lib/utils";
import "@/styles/landing-showcase.css";

/**
 * Kayıtsız "aha" vitrini (7 Kasım 2026): seçili profile göre bir ders önizlemesi (formül, sınav tuzağı, hafıza
 * çivisi), ardından aynı konunun sınav sorusu — şıklar gerçekten tıklanır, "İki şık arasında kaldım" ipucu gerçekten
 * açılır, cevaptan sonra koç tepkisi ve çözüm adımları gelir; en sonda kayıt köprüsü. Hiçbir ağ isteği yok: içerik
 * `landing-showcase.ts`te yazılı, etkileşim yalnız tarayıcıda.
 */
export function InteractiveShowcase({
  segmentId,
  onPickSegment,
}: {
  segmentId: AudienceSegmentId;
  onPickSegment: (id: AudienceSegmentId) => void;
}) {
  return (
    <section id="lp-showcase" className="lp-section lp-show" aria-labelledby="lp-show-title" role="tabpanel">
      <div className="lp-wrap">
        <p className="lp-kicker">{SHOWCASE_COPY.kicker}</p>
        <h2 id="lp-show-title" className="lp-h2">
          {SHOWCASE_COPY.title}
        </h2>
        <AudienceTabs value={segmentId} onChange={onPickSegment} compact controls="lp-showcase" />
        {/* Sekme değişince adımlar başa döner: içerik anahtarla yeniden kurulur. */}
        <ShowcaseCard key={segmentId} segmentId={segmentId} />
      </div>
    </section>
  );
}

function ShowcaseCard({ segmentId }: { segmentId: AudienceSegmentId }) {
  const segment = audienceSegment(segmentId);
  const item = SHOWCASE[segmentId];
  const { question } = item;
  const [step, setStep] = useState<"lesson" | "question">("lesson");
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  const correct = revealed && picked === question.answer;
  const reaction = revealed ? coachReaction({ correct, streak: correct ? 1 : 0, usedHint: hintOpen }) : null;

  return (
    <div className="lp-show-grid">
      <article className={cn("lp-show-card lp-show-card--lesson", step === "question" && "is-dim")} aria-label="Ders önizlemesi">
        <p className="lp-show-step">{SHOWCASE_COPY.stepLesson}</p>
        <p className="lp-show-level">{item.level}</p>
        <h3 className="lp-show-topic">{item.topic}</h3>

        <div className="lp-show-formula">
          <p className="lp-show-tag lp-show-tag--formula">Formül & Kural</p>
          <p className="lp-show-formula-title">{item.formula.title}</p>
          <p className="lp-show-formula-expr">{item.formula.expression}</p>
          <p className="lp-show-note">{item.formula.note}</p>
        </div>

        <aside className="lp-show-visual lp-show-visual--trap" aria-label="Sınav tuzağı">
          <p className="lp-show-tag lp-show-tag--trap">⚠️ Sınav tuzağı</p>
          <p className="lp-show-visual-title">{item.trap.title}</p>
          <p className="lp-show-line">
            <span className="lp-show-pill lp-show-pill--warn">Sakın</span>
            {item.trap.wrong}
          </p>
          <p className="lp-show-line">
            <span className="lp-show-pill lp-show-pill--ok">Doğrusu</span>
            {item.trap.right}
          </p>
          <p className="lp-show-line">
            <span className="lp-show-pill">Ayırt et</span>
            {item.trap.tell}
          </p>
        </aside>

        <aside className="lp-show-visual lp-show-visual--hook" aria-label="Hafıza çivisi">
          <p className="lp-show-tag lp-show-tag--hook">
            🧠 Hafıza çivisi · {item.hook.kind === "shortcut" ? "Kısa yol" : item.hook.kind === "image" ? "Zihin resmi" : "Benzetme"}
          </p>
          <p className="lp-show-visual-title">{item.hook.title}</p>
          <p className="lp-show-body">{item.hook.body}</p>
        </aside>

        {step === "lesson" ? (
          <button type="button" className="lp-btn lp-btn--primary lp-show-try" onClick={() => setStep("question")}>
            {SHOWCASE_COPY.tryButton}
          </button>
        ) : null}
      </article>

      {step === "question" ? (
        <article className="lp-show-card lp-show-card--question" aria-label="Sınav sorusu">
          <p className="lp-show-step">{SHOWCASE_COPY.stepQuestion}</p>
          <p className="lp-show-prompt">{question.prompt}</p>
          <div className="lp-show-options" role="group" aria-label="Şıklar">
            {question.options.map((option, index) => {
              const letter = String.fromCharCode(65 + index);
              const isPicked = picked === option;
              const isRight = revealed && option === question.answer;
              const isWrong = revealed && isPicked && option !== question.answer;
              const inPair = hintOpen && !revealed && question.twoOption.pair.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  disabled={revealed}
                  aria-pressed={isPicked}
                  className={cn("lp-q-option", isPicked && "is-picked", inPair && "is-pair", isRight && "is-right", isWrong && "is-wrong")}
                  onClick={() => setPicked(option)}
                >
                  <span className="lp-q-letter" aria-hidden>
                    {letter}
                  </span>
                  <span className="lp-q-text">{option}</span>
                  {isRight ? <Check className="h-4 w-4 stroke-[3]" aria-label="Doğru cevap" /> : null}
                  {isWrong ? <X className="h-4 w-4 stroke-[3]" aria-label="Yanlış" /> : null}
                </button>
              );
            })}
          </div>

          {!revealed ? (
            <div className="lp-show-tools">
              {!hintOpen ? (
                <button type="button" className="lp-show-chip" onClick={() => setHintOpen(true)}>
                  {TWO_OPTION_CHIP}
                </button>
              ) : (
                <p className="lp-show-hint" role="status">
                  <strong>
                    {question.twoOption.pair[0]} ↔ {question.twoOption.pair[1]}:
                  </strong>{" "}
                  {question.twoOption.hint}
                </p>
              )}
              <button
                type="button"
                className="lp-btn lp-btn--primary lp-show-check"
                disabled={!picked}
                onClick={() => setRevealed(true)}
              >
                {SHOWCASE_COPY.checkButton}
              </button>
            </div>
          ) : null}

          {revealed && reaction ? (
            <div className={cn("lp-show-feedback", correct ? "is-right" : "is-off")} role="status" aria-live="polite">
              <p className="lp-show-coach">{reaction.text}</p>
              <p className="lp-show-explain">{question.explanation}</p>
              <ol className="lp-show-steps">
                {question.steps.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {revealed ? (
            <div className="lp-bridge">
              <p className="lp-bridge-title">{SHOWCASE_COPY.bridgeTitle}</p>
              <p className="lp-bridge-body">{SHOWCASE_COPY.bridgeBody}</p>
              <Link href={segment.signupHref} className="lp-btn lp-btn--primary lp-bridge-cta">
                {bridgeCtaLabel(segment)}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/ornek" className="lp-bridge-secondary">
                {SHOWCASE_COPY.bridgeSecondary}
              </Link>
            </div>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}
