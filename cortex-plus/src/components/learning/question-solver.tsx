"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageUp, Lightbulb, ListPlus, RotateCcw, ShieldAlert, Sparkles, TriangleAlert } from "lucide-react";
import { CreditGate } from "@/components/paywall/credit-gate";
import { requestSolve, SOLVE_STAGE_LABEL, solvePhaseAfter, type SolveDone, type SolvePhase } from "@/lib/solve/solve-client";
import { solutionAnswerLine } from "@/lib/solve/solution-markdown";
import type { SolveStatus } from "@/lib/solve/solve-run";
import "@/styles/question-solver.css";

/*
  Soru çözücü ekranı (23 Ekim 2026). Fotoğraf çek / galeriden seç / yaz → "Çöz". Astra'nın yaklaşımı, bizim tasarım
  dilimizle: işlemli soruda verilenler, istenen ve adım adım açılan çözüm tahtası; sözel soruda her şıkkın neden doğru
  ya da yanlış olduğu; karıştırılan nokta, akılda tut, kontrol. Durum rozeti dürüst: "İki ayrı çözüm aynı sonucu
  verdi", "Kontrol ediliyor", "Doğrulandı", "Emin değiliz".
*/

type Phase = SolvePhase;

export function QuestionSolver({ prep = null }: { prep?: { id: string; title: string } | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [reviewToken, setReviewToken] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [paywall, setPaywall] = useState(false);
  const [paywallMeter, setPaywallMeter] = useState<"photo" | "chat">("photo");
  const [paywallMessage, setPaywallMessage] = useState("Bu soru için bugünkü hakkın yetmiyor.");
  const [seconds, setSeconds] = useState(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => (previewUrl ? URL.revokeObjectURL(previewUrl) : undefined), [previewUrl]);

  useEffect(() => {
    if (phase.kind !== "solving") return;
    setSeconds(0);
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [phase.kind]);

  const canSolve = phase.kind !== "solving" && (Boolean(file) || text.trim().length >= 8);

  function pick(next: File | undefined) {
    if (!next) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(next.type) && !next.type.startsWith("image/")) {
      setPhase({ kind: "error", message: "Yalnız fotoğraf seçebilirsin (JPG, PNG, WEBP)." });
      return;
    }
    setFile(next);
    setPhase({ kind: "idle" });
  }

  async function solve() {
    if (!canSolve) return;
    setPhase({ kind: "solving", stage: "solving" });
    setReviewToken(null);
    await requestSolve({ file, text, review: Boolean(prep) }, (event) => {
      if (event.type === "reviewable") {
        setReviewToken(event.token);
        return;
      }
      if (event.type === "error" && event.status === 402) {
        setPaywallMeter(event.code === "free_chat_limit" ? "chat" : "photo");
        setPaywallMessage(event.message);
        setPaywall(true);
      }
      setPhase((current) => solvePhaseAfter(current, event));
    });
  }

  function reset() {
    setReviewToken(null);
    setFile(null);
    setText("");
    setPhase({ kind: "idle" });
  }

  return (
    <div className="cp-solver">
      {phase.kind !== "done" ? (
        <div className="cp-solver-input">
          <div className="cp-solver-pickers">
            <button type="button" className="cp-solver-pick" onClick={() => cameraRef.current?.click()}>
              <Camera aria-hidden /> Fotoğraf çek
            </button>
            <button type="button" className="cp-solver-pick" onClick={() => galleryRef.current?.click()}>
              <ImageUp aria-hidden /> Galeriden seç
            </button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          {previewUrl ? (
            <div className="cp-solver-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Seçilen soru fotoğrafı" />
              <button type="button" className="cp-solver-link" onClick={() => setFile(null)}>
                Kaldır
              </button>
            </div>
          ) : null}
          <label className="cp-solver-label" htmlFor="cp-solver-text">
            {file ? "Not ekle (isteğe bağlı)" : "ya da soruyu yaz"}
          </label>
          <textarea
            id="cp-solver-text"
            className="cp-solver-text"
            rows={file ? 2 : 4}
            maxLength={4000}
            value={text}
            placeholder={file ? "Örneğin: 3. soruyu çöz" : "Soruyu ve şıklarını buraya yaz"}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" className="cp-solver-go" disabled={!canSolve} onClick={() => void solve()}>
            {phase.kind === "solving" ? `${SOLVE_STAGE_LABEL[phase.stage]} ${seconds} sn` : "Çöz"}
          </button>
          {phase.kind === "error" ? (
            <p className="cp-solver-error" role="alert">
              <TriangleAlert aria-hidden /> {phase.message}
            </p>
          ) : null}
        </div>
      ) : (
        <SolutionView
          phase={phase}
          onReset={reset}
          extra={prep && reviewToken ? <AddToReview key={reviewToken} prepId={prep.id} token={reviewToken} /> : null}
        />
      )}
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        action={paywallMeter === "chat" ? "AI_CHAT_STANDARD" : "IMAGE_SOLUTION"}
        meter={paywallMeter}
        message={paywallMessage}
        returnPath="/soru-coz"
      />
    </div>
  );
}

function StatusBadge({ status, verifying }: { status: SolveStatus | "verified" | "revised"; verifying: boolean }) {
  if (status === "uncertain") {
    return (
      <span className="cp-solver-badge cp-solver-badge--warn">
        <ShieldAlert aria-hidden /> Emin değiliz: iki çözüm farklı sonuç verdi, cevabı kitabınla karşılaştır
      </span>
    );
  }
  if (status === "revised") {
    return (
      <span className="cp-solver-badge cp-solver-badge--warn">
        <ShieldAlert aria-hidden /> Denetimde bir hata bulundu; çözüm düzeltildi
      </span>
    );
  }
  if (verifying) {
    return <span className="cp-solver-badge">İki çözüm aynı sonucu verdi · ikinci göz kontrol ediyor…</span>;
  }
  return (
    <span className="cp-solver-badge cp-solver-badge--ok">
      <CheckCircle2 aria-hidden /> {status === "verified" ? "İki ayrı çözüm ve denetim aynı sonucu verdi" : "İki ayrı çözüm aynı sonucu verdi"}
    </span>
  );
}

/** Çözüm kartı; soru çöz sayfası ve sohbet aynı kartı çizer. Sohbette "Yeni soru" düğmesi yok. */
export function SolutionView({ phase, onReset, extra }: { phase: SolveDone; onReset?: () => void; extra?: ReactNode }) {
  const { solution } = phase;
  const [shown, setShown] = useState(1);
  const answerLine = solutionAnswerLine(solution);
  const steps = solution.steps;
  const allShown = shown >= steps.length;

  return (
    <article className="cp-solver-result" aria-live="polite">
      <header className="cp-solver-head">
        {solution.subject ? <span className="cp-solver-subject">{solution.subject}</span> : null}
        <span className="cp-solver-time">{Math.max(1, Math.round(phase.ms / 1000))} sn</span>
      </header>
      <StatusBadge status={phase.status} verifying={phase.verifying} />
      {phase.note ? <p className="cp-solver-note">{phase.note}</p> : null}

      <section className="cp-solver-answer">
        <p className="cp-solver-answer-label">Doğru cevap</p>
        <p className="cp-solver-answer-value">{answerLine}</p>
        {solution.answer.text && solution.answer.text !== answerLine ? <p className="cp-solver-answer-text">{solution.answer.text}</p> : null}
      </section>

      {solution.intro ? <p className="cp-solver-intro">{solution.intro}</p> : null}

      {solution.given.length || solution.asked ? (
        <section className="cp-solver-facts">
          {solution.given.length ? (
            <div>
              <h3>Verilenler</h3>
              <ul>
                {solution.given.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {solution.asked ? (
            <div>
              <h3>İstenen</h3>
              <p>{solution.asked}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {steps.length ? (
        <section className="cp-solver-board">
          <h3>
            Çözüm adımları <span>{Math.min(shown, steps.length)} / {steps.length}</span>
          </h3>
          <ol>
            {steps.slice(0, shown).map((step, index) => (
              <li key={index}>
                {step.math ? <p className="cp-solver-math">{step.math}</p> : null}
                {step.say ? <p className="cp-solver-say">{step.say}</p> : null}
              </li>
            ))}
          </ol>
          {!allShown ? (
            <div className="cp-solver-board-nav">
              <button type="button" className="cp-solver-next" onClick={() => setShown((n) => n + 1)}>
                Sonraki adım
              </button>
              <button type="button" className="cp-solver-link" onClick={() => setShown(steps.length)}>
                Hepsini göster
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {solution.optionsWhy.length ? (
        <section className="cp-solver-options">
          <h3>Şıklar</h3>
          <ul>
            {solution.optionsWhy.map((o) => {
              const correct = o.correct || o.letter === solution.answer.letter;
              const label = solution.options.find((x) => x.letter === o.letter)?.text;
              return (
                <li key={o.letter} className={correct ? "is-correct" : undefined}>
                  <span className="cp-solver-letter">{o.letter}</span>
                  <div>
                    {label ? <p className="cp-solver-option-text">{label}</p> : null}
                    <p className="cp-solver-option-why">{o.why}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {solution.trap ? (
        <aside className="cp-solver-box cp-solver-box--trap">
          <TriangleAlert aria-hidden />
          <div>
            <p className="cp-solver-box-title">Karıştırılan nokta</p>
            <p>{solution.trap}</p>
          </div>
        </aside>
      ) : null}
      {solution.tip ? (
        <aside className="cp-solver-box cp-solver-box--tip">
          <Lightbulb aria-hidden />
          <div>
            <p className="cp-solver-box-title">Akılda tut</p>
            <p>{solution.tip}</p>
          </div>
        </aside>
      ) : null}
      {solution.check ? (
        <p className="cp-solver-check">
          <Sparkles aria-hidden /> {solution.check}
        </p>
      ) : null}

      <details className="cp-solver-read">
        <summary>Sorunun okunuşu</summary>
        <p>{solution.question}</p>
        {solution.options.length ? (
          <ul>
            {solution.options.map((o) => (
              <li key={o.letter}>
                {o.letter}) {o.text}
              </li>
            ))}
          </ul>
        ) : null}
      </details>

      {extra}
      {onReset ? (
        <button type="button" className="cp-solver-go" onClick={onReset}>
          <RotateCcw aria-hidden /> Yeni soru
        </button>
      ) : null}
    </article>
  );
}

/*
  Hazırlıktan açılan çözücüde: şıklı soru hazırlığın tekrar listesine eklenir, yarın ve sonra 3-7-14 gün sonra
  yeniden sorulur. Belirteç sunucunun imzası; doğru cevap tarayıcıdan gelmez.
*/
function AddToReview({ prepId, token }: { prepId: string; token: string }) {
  const [state, setState] = useState<"idle" | "saving" | "added" | "already" | "error">("idle");

  async function add() {
    setState("saving");
    try {
      const response = await fetch("/api/learning/exam-prep/review/solved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, token }),
      });
      const payload = (await response.json().catch(() => ({}))) as { scheduled?: number };
      if (!response.ok) setState("error");
      else setState(payload.scheduled ? "added" : "already");
    } catch {
      setState("error");
    }
  }

  if (state === "added") {
    return (
      <p className="cp-solver-added" role="status">
        <CheckCircle2 aria-hidden /> Tekrar listene eklendi · yarın yeniden sorulacak
      </p>
    );
  }
  if (state === "already") {
    return (
      <p className="cp-solver-added" role="status">
        <CheckCircle2 aria-hidden /> Bu soru zaten tekrar listende
      </p>
    );
  }
  return (
    <div className="cp-solver-review">
      <button type="button" className="cp-solver-next" disabled={state === "saving"} onClick={() => void add()}>
        <ListPlus aria-hidden /> {state === "saving" ? "Ekleniyor…" : "Tekrar listeme ekle"}
      </button>
      {state === "error" ? <span className="cp-solver-note">Eklenemedi; bir daha dene.</span> : null}
    </div>
  );
}
