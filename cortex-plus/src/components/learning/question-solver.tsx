"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageUp, ListPlus, ShieldAlert, TriangleAlert } from "lucide-react";
import { CreditGate } from "@/components/paywall/credit-gate";
import { MathText } from "@/components/learning/math-text";
import { requestSolve, SOLVE_STAGE_LABEL, solvePhaseAfter, type SolveDone, type SolvePhase } from "@/lib/solve/solve-client";
import { solutionAnswerLine } from "@/lib/solve/solution-markdown";
import type { SolveStatus } from "@/lib/solve/solve-run";
import {
  socraticHint,
  SOLVE_DISCUSS_STORAGE_KEY,
  solveDiscussPrompt,
} from "@/lib/solve/socratic-solve";
import { parseTutorStyle, type TutorStyle } from "@/lib/learning/tutor-style";
import "@/styles/question-solver.css";

/*
  Soru çözücü ekranı (25 Ekim 2026). Dört ferah bölüm: (1) fotoğraf + "soruyu böyle okudum",
  (2) tek satırlık mod anahtarı, (3) dikey adım akışı, (4) sonuç kartı ve iki aksiyon.
  Varsayılan: bütün adımlar açık. Yalnız `hints_first` profili veya öğrencinin tıklaması ipucu modunu açar.
*/

type Phase = SolvePhase;

export function QuestionSolver({
  prep = null,
  tutorStyle,
}: {
  prep?: { id: string; title: string } | null;
  tutorStyle?: TutorStyle;
}) {
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
          imageSrc={previewUrl}
          onReset={reset}
          initialTutorStyle={tutorStyle}
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

function TrustBadge({
  status,
  verifying,
  agreed = true,
}: {
  status: SolveStatus | "verified" | "revised";
  verifying: boolean;
  agreed?: boolean;
}) {
  if (status === "uncertain") {
    return (
      <span className="cp-solver-badge cp-solver-badge--warn">
        <ShieldAlert aria-hidden /> Emin değiliz: cevabı kitabınla karşılaştır
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
    return (
      <span className="cp-solver-badge">
        {agreed ? "İki çözüm aynı sonucu verdi" : "İki çözüm karşılaştırıldı"} · ikinci göz kontrol ediyor…
      </span>
    );
  }
  // 24 Ekim 2026: uzlaştırılan çözümde de "aynı sonucu verdi" yazıyordu.
  if (!agreed) {
    return (
      <span className="cp-solver-badge cp-solver-badge--ok">
        <CheckCircle2 aria-hidden />{" "}
        {status === "verified" ? "İki çözüm karşılaştırıldı; denetim de onayladı" : "İki çözüm karşılaştırılıp doğru cevap seçildi"}
      </span>
    );
  }
  return (
    <span className="cp-solver-shield" title={status === "verified" ? "İki ayrı çözüm ve denetim aynı sonucu verdi" : "İki ayrı çözüm aynı sonucu verdi"}>
      🛡️ Çift AI Sağlaması Yapıldı
    </span>
  );
}

/** Fotoğrafta birden çok soru varsa hangisinin çözüldüğü ve öbürü nasıl istenir (24 Ekim 2026). */
export function otherQuestionsLine(solution: { questionNumber?: string; otherQuestions: string[] }): string {
  const solved = solution.questionNumber ? `${solution.questionNumber}. soruyu` : "İlk soruyu";
  const others = solution.otherQuestions.slice(0, 8).join(", ");
  return `Fotoğrafta başka sorular da var (${others}). ${solved} çözdüm; başka birini istersen fotoğrafı yeniden seç ve nota numarasını yaz, örneğin "${solution.otherQuestions[0]}. soru".`;
}

function stepTitle(step: { title?: string; say: string; math?: string }, index: number): string {
  if (step.title?.trim()) return step.title.trim();
  const fromSay = step.say.trim().split(/[.?!]/)[0] ?? "";
  if (fromSay && fromSay.length <= 56) return fromSay;
  return `${index + 1}. adım`;
}

/** Çözüm kartı; soru çöz sayfası ve sohbet aynı kartı çizer. Sohbette "Yeni soru" düğmesi yok. */
export function SolutionView({
  phase,
  onReset,
  extra,
  initialTutorStyle,
  onDiscuss,
  imageSrc,
}: {
  phase: SolveDone;
  onReset?: () => void;
  extra?: ReactNode;
  initialTutorStyle?: TutorStyle;
  onDiscuss?: (prompt: string) => void;
  imageSrc?: string | null;
}) {
  const { solution } = phase;
  const socraticDefault = parseTutorStyle(initialTutorStyle) === "hints_first";
  const [view, setView] = useState<"socratic" | "full">(socraticDefault ? "socratic" : "full");
  const [shown, setShown] = useState(socraticDefault ? 0 : solution.steps.length);
  const [lightbox, setLightbox] = useState(false);
  const answerLine = solutionAnswerLine(solution);
  const steps = solution.steps;
  const allShown = shown >= steps.length;
  const locked = view === "socratic" && !allShown;
  const hint = socraticHint(solution);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  function openFull() {
    setView("full");
    setShown(steps.length);
  }

  function revealSteps() {
    setShown((current) => Math.min(steps.length, current === 0 ? 1 : current + 1));
  }

  return (
    <article className="cp-solver-result" aria-live="polite">
      <header className="cp-solver-readback">
        {imageSrc ? (
          <button type="button" className="cp-solver-thumb" onClick={() => setLightbox(true)} aria-label="Fotoğrafı büyüt">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt="" />
          </button>
        ) : null}
        <div className="cp-solver-readback-body">
          <div className="cp-solver-readback-meta">
            {solution.subject ? <span className="cp-solver-subject">{solution.subject}</span> : null}
            <span className="cp-solver-time">{Math.max(1, Math.round(phase.ms / 1000))} sn</span>
          </div>
          <p className="cp-solver-readback-label">Soruyu böyle okudum</p>
          <p className="cp-solver-readback-q">{solution.question}</p>
          {solution.options.length ? (
            <ul className="cp-solver-readback-opts">
              {solution.options.map((option) => (
                <li key={option.letter}>
                  <span>{option.letter}</span>
                  {option.text}
                </li>
              ))}
            </ul>
          ) : null}
          {solution.criticalWords?.length ? (
            <p className="cp-solver-flags">
              {solution.criticalWords.map((word) => (
                <span key={word}>{word}</span>
              ))}
            </p>
          ) : null}
        </div>
      </header>
      {phase.note ? <p className="cp-solver-note">{phase.note}</p> : null}
      {solution.otherQuestions?.length ? (
        <p className="cp-solver-note">
          {otherQuestionsLine({ questionNumber: solution.questionNumber, otherQuestions: solution.otherQuestions })}
        </p>
      ) : null}

      <div className="cp-solver-toolbar">
        <div className="cp-solver-modes" role="tablist" aria-label="Çözüm görünümü">
          <button
            type="button"
            role="tab"
            aria-selected={view === "full"}
            className={view === "full" ? "is-on" : undefined}
            onClick={openFull}
          >
            ⚡ Adım Adım Çözüm
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "socratic"}
            className={view === "socratic" ? "is-on" : undefined}
            onClick={() => {
              setView("socratic");
              setShown(0);
            }}
          >
            💡 Kendim Deneyeyim (İpucu Modu)
          </button>
        </div>
      </div>

      {view === "socratic" ? (
        <p className="cp-solver-hintline">
          💡 {hint}
        </p>
      ) : null}

      {steps.length ? (
        <ol className={locked && shown === 0 ? "cp-solver-timeline cp-solver-board--locked" : "cp-solver-timeline"}>
          {(view === "full" ? steps : steps.slice(0, Math.max(shown, 0))).map((step, index) => (
            <li key={index}>
              <span className="cp-solver-step-num" aria-hidden>
                {index + 1}
              </span>
              <div className="cp-solver-step">
                <h3>{stepTitle(step, index)}</h3>
                {step.math ? <MathText text={step.math} className="cp-solver-math" /> : null}
                {step.say ? (
                  <p className="cp-solver-say">
                    <span className="cp-solver-why">💡 Mantığı:</span> {step.say}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {view === "socratic" && !allShown ? (
        <button type="button" className="cp-solver-next" onClick={revealSteps}>
          {shown === 0 ? "Çözüm Adımlarını Göster" : "Sonraki adım"}
        </button>
      ) : null}

      <section className={locked ? "cp-solver-answer cp-solver-answer--locked" : "cp-solver-answer"} aria-hidden={locked || undefined}>
        <div className="cp-solver-answer-top">
          <p className="cp-solver-answer-label">Doğru cevap</p>
          {!locked ? <TrustBadge status={phase.status} verifying={phase.verifying} agreed={phase.agreed} /> : null}
        </div>
        <p className="cp-solver-answer-value">{answerLine}</p>
        {!locked && solution.answer.text && solution.answer.text !== answerLine ? (
          <p className="cp-solver-answer-text">{solution.answer.text}</p>
        ) : null}
        {!locked && solution.trap ? (
          <p className="cp-solver-trap">⚠️ Sınav tuzağı / dikkat: {solution.trap}</p>
        ) : null}
      </section>

      {extra}
      <div className="cp-solver-actions">
        <DiscussAction solution={solution} onDiscuss={onDiscuss} />
        {onReset ? (
          <button type="button" className="cp-solver-secondary" onClick={onReset}>
            📸 Yeni Soru Yükle
          </button>
        ) : null}
      </div>

      {lightbox && imageSrc ? (
        <div
          className="cp-solver-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Soru fotoğrafı"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="Soru fotoğrafı" />
        </div>
      ) : null}
    </article>
  );
}

function DiscussAction({
  solution,
  onDiscuss,
}: {
  solution: Parameters<typeof solveDiscussPrompt>[0];
  onDiscuss?: (prompt: string) => void;
}) {
  const prompt = solveDiscussPrompt(solution);
  if (onDiscuss) {
    return (
      <button type="button" className="cp-solver-discuss" onClick={() => onDiscuss(prompt)}>
        💬 Anlamadığım Yeri Öğretmene Sor
      </button>
    );
  }
  return (
    <a
      href="/ogretmen"
      className="cp-solver-discuss"
      onClick={() => {
        try {
          sessionStorage.setItem(SOLVE_DISCUSS_STORAGE_KEY, prompt);
        } catch {
          /* gizli pencerede depolama kapalı olabilir */
        }
      }}
    >
      💬 Anlamadığım Yeri Öğretmene Sor
    </a>
  );
}

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
      <button type="button" className="cp-solver-link" disabled={state === "saving"} onClick={() => void add()}>
        <ListPlus aria-hidden /> {state === "saving" ? "Ekleniyor…" : "Tekrar listeme ekle"}
      </button>
      {state === "error" ? <span className="cp-solver-note">Eklenemedi; bir daha dene.</span> : null}
    </div>
  );
}
