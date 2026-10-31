"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Flag,
  LayoutGrid,
  Loader2,
  LogOut,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { ScratchPad } from "@/components/parity/scratch-pad";
import { cn } from "@/lib/utils";
import { possessiveAccusativeSuffix } from "@/lib/text/number-suffix";
import {
  ANSWER_SAVE_DEBOUNCE_MS,
  multiMcqScoringNote,
  openAnswerHint,
  questionTypeChip,
  type MockQuestionType,
} from "@/lib/learning/mock-exam";
import {
  clearExamDraft,
  markExamDraftSaved,
  readExamDraft,
  rememberExamDeadline,
  resolveExamResume,
  secondsUntil,
  writeExamDraft,
  type ExamAnswers,
  type ExamAnswerValue,
  type ServerExamDraft,
} from "@/lib/learning/mock-exam/exam-draft";
import { fetchWithRetry, SAVE_RETRY_DELAYS_MS, SAVE_TIMEOUT_MS } from "@/lib/learning/retry-fetch";

export type RunnerQuestion = {
  id: string;
  text: string;
  options: string[];
  question_type: string;
  points?: number;
};

/** Tarayıcı deposu: gizli pencerede ya da engellenmiş site verisinde erişim fırlatabilir. */
function examDraftStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ParityExamRunner({
  examId,
  prepId,
  title,
  questions,
}: {
  examId: string;
  prepId: string;
  title: string;
  questions: RunnerQuestion[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<ExamAnswers>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [untimed, setUntimed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [announced5, setAnnounced5] = useState(false);
  const [announced1, setAnnounced1] = useState(false);
  const [liveMsg, setLiveMsg] = useState("");
  /** Sınav notlandı: taslak silindi, sayfadan çıkış artık uyarılmaz. */
  const [finished, setFinished] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitting = useRef(false);
  /** Çözümün başladığı an: sayfanın açılışı ya da sunucunun kayıtlı başlangıcı (hangisi önceyse). */
  const startedAtRef = useRef<number>(Date.now());
  /**
   * Güncel durum senkron okunur (31 Ekim 2026): kayıt zamanlayıcısı ve gönderim eski bir çizimin
   * kapanışına takılıp bir önceki cevabı ya da soruyu göndermesin.
   */
  const answersRef = useRef<ExamAnswers>({});
  const flaggedRef = useRef<Set<string>>(new Set());
  const indexRef = useRef(0);
  /** Sunucunun bitiş anı; taslağa yazılır, açılış isteği düşerse saat buradan sürer. */
  const deadlineRef = useRef<string | null>(null);
  /** Aynı anda tek kayıt isteği: yeniden denenen eski küme yenisinin üstüne yazılmasın. */
  const saveFlightRef = useRef<{ running: boolean; queued: boolean }>({ running: false, queued: false });

  const current = questions[index];
  const type = (current?.question_type || "mcq") as MockQuestionType;
  const isMulti = type === "multi_mcq";

  const answeredCount = useMemo(
    () =>
      Object.values(answers).filter((val) => {
        if (Array.isArray(val)) return val.length > 0;
        return typeof val === "string" && val.trim().length > 0;
      }).length,
    [answers],
  );

  function clampIndex(value: number): number {
    return Math.min(Math.max(0, Math.floor(value)), Math.max(0, questions.length - 1));
  }

  function applyDraftState(nextAnswers: ExamAnswers, nextFlagged: string[], nextIndex: number) {
    const flags = new Set(nextFlagged);
    const at = clampIndex(nextIndex);
    answersRef.current = nextAnswers;
    flaggedRef.current = flags;
    indexRef.current = at;
    setAnswers(nextAnswers);
    setFlagged(flags);
    setIndex(at);
  }

  /** Kayıt isteği: tek uçuş; uçarken gelen düzenleme bitince en son kümeyle bir kez daha gider. */
  async function sendSave() {
    const flight = saveFlightRef.current;
    if (flight.running) {
      flight.queued = true;
      return;
    }
    flight.running = true;
    flight.queued = false;
    const sentAt = readExamDraft(examDraftStorage(), examId)?.updatedAt ?? Date.now();
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetchWithRetry(
        "/api/learning/exam/session?action=save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examId,
            answers: answersRef.current,
            flaggedIds: [...flaggedRef.current],
            cursorIndex: indexRef.current,
          }),
        },
        { timeoutMs: SAVE_TIMEOUT_MS, retryDelaysMs: SAVE_RETRY_DELAYS_MS },
      );
      if (res.ok) markExamDraftSaved(examDraftStorage(), examId, sentAt);
      else setSaveError(true);
    } catch {
      // Ağ ya da zaman aşımı: cevaplar tarayıcı taslağında, açılışta yeniden gönderilir.
      setSaveError(true);
    } finally {
      setSaving(false);
      flight.running = false;
      if (flight.queued) void sendSave();
    }
  }

  function persist(delayMs = ANSWER_SAVE_DEBOUNCE_MS) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void sendSave();
    }, delayMs);
  }

  /**
   * Düzenleme (31 Ekim 2026): seçim, yazı, işaret ve soru değişimi tarayıcı taslağına HEMEN yazılır;
   * sunucuya kısa beklemeden sonra. Yenilenen sayfa aynı soruda, aynı cevaplarla açılır.
   */
  function remember() {
    writeExamDraft(examDraftStorage(), examId, {
      answers: answersRef.current,
      flaggedIds: [...flaggedRef.current],
      cursor: indexRef.current,
      deadlineAt: deadlineRef.current ?? undefined,
    });
    persist();
  }

  function goTo(next: number) {
    const target = clampIndex(next);
    if (target === indexRef.current) return;
    indexRef.current = target;
    setIndex(target);
    remember();
  }

  async function startSession() {
    let payload: Record<string, unknown> = {};
    try {
      const res = await fetchWithRetry(
        "/api/learning/exam/session?action=start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examId }),
        },
        { timeoutMs: SAVE_TIMEOUT_MS, retryDelaysMs: SAVE_RETRY_DELAYS_MS },
      );
      payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      // Açılış düştü: tarayıcı taslağıyla (cevaplar, soru, bitiş anı) devam edilir.
      if (!res.ok) return;
    } catch {
      return;
    }
    const serverStart = Date.parse(String(payload.startedAt ?? ""));
    if (Number.isFinite(serverStart) && serverStart <= Date.now()) {
      startedAtRef.current = Math.min(startedAtRef.current, serverStart);
    }
    setUntimed(payload.untimed === true);
    // Süre sunucunun bitiş anından (notlandırmanın da okuduğu): yenilenen sayfada kalan saniye aynı.
    setTimeLeft(typeof payload.timeLeftSec === "number" ? payload.timeLeftSec : null);
    deadlineRef.current = typeof payload.deadlineAt === "string" ? payload.deadlineAt : null;
    rememberExamDeadline(examDraftStorage(), examId, deadlineRef.current);

    // Hangisi yeniyse o (tarayıcı taslağı ya da sunucu kaydı); öbürünün yalnız eksik cevapları eklenir.
    const server: ServerExamDraft = {
      answers:
        payload.answers && typeof payload.answers === "object" ? (payload.answers as ExamAnswers) : {},
      flaggedIds: Array.isArray(payload.flaggedIds) ? (payload.flaggedIds as string[]) : [],
      cursor: typeof payload.cursorIndex === "number" ? payload.cursorIndex : null,
      updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
    };
    const resume = resolveExamResume(readExamDraft(examDraftStorage(), examId), server);
    if (!resume.from) return;
    applyDraftState(resume.answers, resume.flaggedIds, resume.cursor);
    if (resume.from === "server" && (Object.keys(resume.answers).length || resume.cursor > 0)) {
      // Sunucunun kaydı bu cihaza da: taslak "kaydedilmiş" durur, sonraki düzenleme onu ilerletir.
      const now = Date.now();
      writeExamDraft(examDraftStorage(), examId, {
        answers: resume.answers,
        flaggedIds: resume.flaggedIds,
        cursor: indexRef.current,
        deadlineAt: deadlineRef.current,
        now,
        savedAt: now,
      });
    }
    if (resume.push) persist(0);
  }

  // Açılış (31 Ekim 2026): önce bu cihazın taslağı (anında; sunucu yanıtı gecikse de cevaplar ve soru
  // yerinde), sonra sunucu. Sunucuda çizimde depo yok; taslak yalnız tarayıcıda, etkide okunur.
  useEffect(() => {
    const local = readExamDraft(examDraftStorage(), examId);
    if (local) {
      applyDraftState(local.answers, local.flaggedIds, local.cursor);
      deadlineRef.current = local.deadlineAt;
      // Geçici saat: bitiş anı geçmişse sunucuyu bekler (taslağa bakarak sınav gönderilmez).
      const left = secondsUntil(local.deadlineAt);
      if (left != null && left > 0) setTimeLeft(left);
    }
    void startSession();
    return () => {
      // Sayfadan ayrılırken bekleyen kayıt hemen gider (taslak zaten yazılı).
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void sendSave();
      }
    };
    // Sınav başına bir kez; kayıt işlevleri güncel durumu ref'ten okur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // Geri tuşu / yenileme uyarısı (31 Ekim 2026): en az bir cevap verilmiş ve sınav bitmemişken.
  // Uygulama içi geçişler (Çık, sonuç sayfası) engellenmez; cevaplar taslakta, dönünce yerinde.
  const inProgress = answeredCount > 0 && !finished;
  useEffect(() => {
    if (!inProgress) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inProgress]);

  useEffect(() => {
    if (timeLeft == null) return;
    if (timeLeft <= 0) {
      setTimeUp(true);
      void submit(true);
      return;
    }
    if (timeLeft <= 300 && !announced5) {
      setAnnounced5(true);
      toast.message("Son 5 dakika.");
      setLiveMsg("Son 5 dakika.");
    }
    if (timeLeft <= 60 && !announced1) {
      setAnnounced1(true);
      setLiveMsg("Son 1 dakika.");
    }
    const id = setTimeout(() => setTimeLeft((t) => (t == null ? t : t - 1)), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, announced5, announced1]);

  function setAnswer(value: ExamAnswerValue) {
    if (!current) return;
    const next = { ...answersRef.current, [current.id]: value };
    answersRef.current = next;
    setAnswers(next);
    remember();
  }

  function toggleFlag() {
    if (!current) return;
    const next = new Set(flaggedRef.current);
    if (next.has(current.id)) next.delete(current.id);
    else next.add(current.id);
    flaggedRef.current = next;
    setFlagged(next);
    remember();
  }

  async function submit(fromTimer = false) {
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setShowFinish(false);
    try {
      const res = await fetch("/api/learning/exam/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId,
          answers: answersRef.current,
          flaggedIds: [...flaggedRef.current],
          elapsedSeconds: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
        }),
      });
      // 402 beklenmez; yine de yakala
      if (res.status === 402) {
        toast.error("Değerlendirme şu anda yapılamadı. Yanıtların korundu.");
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Değerlendirme yapılamadı.");
        return;
      }
      // Notlandı: taslak silinir, bekleyen kayıt gitmez, çıkış uyarısı kalkar.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      clearExamDraft(examDraftStorage(), examId);
      setFinished(true);
      router.push(`/deneme-sinavlari/${prepId}/sonuc?examId=${examId}`);
    } catch {
      toast.error("Bağlantı hatası oluştu.");
      if (fromTimer) submitting.current = false;
    } finally {
      setLoading(false);
      if (!fromTimer) submitting.current = false;
    }
  }

  function speak() {
    if (!current || typeof window === "undefined" || !window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(current.text);
    u.lang = "tr-TR";
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight") goTo(indexRef.current + 1);
      if (e.key === "ArrowLeft") goTo(indexRef.current - 1);
      if (e.key.toLowerCase() === "f") toggleFlag();
      if (type === "mcq" || type === "multi_mcq") {
        const letters = ["a", "b", "c", "d", "e"];
        const li = letters.indexOf(e.key.toLowerCase());
        if (li >= 0 && current?.options[li]) {
          if (isMulti) {
            const cur = Array.isArray(answers[current.id])
              ? [...(answers[current.id] as string[])]
              : [];
            const opt = current.options[li];
            const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
            setAnswer(next);
          } else {
            setAnswer(current.options[li]);
          }
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current, type, answers, flagged]);

  if (!questions.length) return null;

  const selected = answers[current.id];
  const selectedList = Array.isArray(selected) ? selected : selected ? [selected] : [];
  const timerUrgent = timeLeft != null && timeLeft <= 60;
  const timerWarn = timeLeft != null && timeLeft <= 300 && !timerUrgent;

  // Yükseklik 100dvh'den (31 Ekim 2026): telefonda 100vh tarayıcı çubukları ve klavye açıkken görünen
  // alandan uzun kalıyor, alttaki düğmeler ekranın dışına düşüyordu.
  return (
    <div className="mock-exam-root mx-auto flex min-h-[calc(100dvh-120px)] w-full max-w-3xl flex-col px-4 pb-28 pt-2">
      <div className="sr-only" aria-live="assertive">
        {liveMsg}
      </div>

      {/* Üst çubuk */}
      <header className="mock-exam-topbar sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-[color:var(--cp-border)] bg-[color:color-mix(in_srgb,var(--cp-bg)_92%,transparent)] backdrop-blur">
        <button
          type="button"
          className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2 text-[color:var(--pm-danger,#ef4444)] hover:bg-white/5"
          aria-label="Sınavdan çık"
          onClick={() => setShowExit(true)}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">Çık</span>
        </button>

        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-base font-bold tabular-nums",
            timerUrgent && "text-[color:var(--pm-danger,#ef4444)] animate-pulse",
            timerWarn && "text-[color:#f59e0b]",
            !timerWarn && !timerUrgent && "text-[color:var(--cp-text)]",
          )}
          aria-label={untimed ? "Süresiz" : timeLeft != null ? `Kalan süre ${formatClock(timeLeft)}` : "Süre"}
        >
          <Timer className="h-4 w-4" />
          {untimed ? "Süresiz" : timeLeft == null ? "…" : formatClock(timeLeft)}
        </div>

        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-xl px-2 text-sm text-[color:var(--cp-text)] hover:bg-white/5"
          aria-label="Soru haritasını aç"
          onClick={() => setShowMap(true)}
        >
          <LayoutGrid className="h-4 w-4" />
          <span className="font-semibold tabular-nums">
            {index + 1} / {questions.length}
          </span>
        </button>
      </header>

      <div
        className="mt-0 h-[3px] bg-[color:color-mix(in_srgb,var(--c-action)_20%,transparent)]"
        aria-hidden
      >
        <div
          className="h-full bg-action transition-[width] duration-150"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      <p className="mt-2 min-h-5 text-center text-xs text-[color:var(--cp-muted)]" aria-live="polite">
        {saving ? "Kaydediliyor…" : saveError ? (
          <button
            type="button"
            className="text-[color:var(--pm-danger,#ef4444)]"
            onClick={() => persist(0)}
          >
            Cevap kaydedilemedi · Yeniden dene
          </button>
        ) : null}
      </p>

      {/* Soru kartı */}
      <article className="mt-4 rounded-[20px] border border-[color:var(--cp-border)] bg-[color:var(--cp-surface)] p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-[color:var(--cp-muted)]">
            Soru {index + 1}
          </span>
          <span className="rounded-full bg-[color:color-mix(in_srgb,var(--c-action)_20%,transparent)] px-2.5 py-1 text-xs text-[color:var(--cp-text)]">
            {/* Puan sağda bir kez yazar; çipte tekrar edilmez ("Klasik · 10 puan … 10 puan"). */}
            {questionTypeChip(type)}
          </span>
          {current.points != null ? (
            <span className="ml-auto text-xs text-[color:var(--cp-muted)]">{current.points} puan</span>
          ) : null}
          <button
            type="button"
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-xl px-2 text-sm",
              flagged.has(current.id)
                ? "text-[color:#f59e0b]"
                : "text-[color:var(--cp-muted)] hover:bg-white/5",
            )}
            aria-pressed={flagged.has(current.id)}
            onClick={toggleFlag}
          >
            <Flag className="h-4 w-4" />
            İşaretle
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-[color:var(--cp-muted)] hover:bg-white/5"
            aria-label={speaking ? "Dinlemeyi durdur" : "Soruyu dinle"}
            onClick={speak}
          >
            {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            Dinle
          </button>
          <ScratchPad />
        </div>

        <p className="text-[19px] font-medium leading-[1.6] text-[color:var(--cp-text)]">
          {current.text}
        </p>

        <div className="mt-5 space-y-2">
          {(type === "mcq" || type === "multi_mcq") &&
            current.options.map((opt, oi) => {
              const letter = String.fromCharCode(65 + oi);
              const on = selectedList.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition-colors duration-150",
                    on
                      ? "border-[var(--c-action)] bg-[color:color-mix(in_srgb,var(--c-action)_14%,transparent)]"
                      : "border-[color:var(--cp-border)] bg-[color:var(--cp-surface-2)] hover:bg-white/5",
                  )}
                  onClick={() => {
                    if (isMulti) {
                      const next = on
                        ? selectedList.filter((x) => x !== opt)
                        : [...selectedList, opt];
                      setAnswer(next);
                    } else {
                      setAnswer(opt);
                    }
                  }}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-xs font-semibold",
                      isMulti ? "rounded-md" : "rounded-full",
                      on ? "bg-action text-white" : "bg-white/10 text-[color:var(--cp-muted)]",
                    )}
                  >
                    {isMulti ? (on ? "✓" : "") : letter}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}

          {type === "true_false" &&
            ["Doğru", "Yanlış"].map((opt) => {
              const on = selectedList[0] === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  className={cn(
                    "w-full rounded-full px-5 py-3 text-[15px] font-semibold transition-colors",
                    on
                      ? "bg-action text-white"
                      : "border border-[color:var(--cp-border)] bg-[color:var(--cp-surface-2)]",
                  )}
                  onClick={() => setAnswer(opt)}
                >
                  {opt}
                </button>
              );
            })}

          {type === "numeric" && (
            <input
              type="text"
              inputMode="decimal"
              className="h-12 w-full rounded-xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface-2)] px-4 text-[15px]"
              placeholder="Sayısal cevap"
              value={typeof selected === "string" ? selected : ""}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}

          {(type === "short_answer" || type === "open") && (
            <div>
              <textarea
                className="w-full resize-y rounded-xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface-2)] px-4 py-3 text-[15px] leading-relaxed"
                rows={type === "open" ? 8 : 3}
                value={typeof selected === "string" ? selected : ""}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Cevabını yaz"
              />
              <div className="mt-1 flex justify-between text-xs text-[color:var(--cp-muted)]">
                <span>
                  {type === "open" ? openAnswerHint(current.text) : null}
                </span>
                <span>{typeof selected === "string" ? selected.length : 0}</span>
              </div>
            </div>
          )}
        </div>
      </article>

      {/* Alt çubuk */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-[color:var(--cp-border)] bg-[color:var(--cp-bg)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <button
            type="button"
            className="h-12 rounded-xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface-2)] px-4 text-sm font-semibold disabled:opacity-45"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
          >
            ← Önceki
          </button>
          <button
            type="button"
            className="flex-1 text-center text-sm text-[color:var(--cp-muted)]"
            onClick={() => setShowMap(true)}
          >
            {answeredCount} / {questions.length} yanıtlandı
          </button>
          {index < questions.length - 1 ? (
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary h-12 min-w-[7rem] rounded-full px-5 text-sm font-semibold"
              onClick={() => goTo(index + 1)}
            >
              Sonraki →
            </button>
          ) : (
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary h-12 min-w-[7rem] rounded-full px-5 text-sm font-semibold"
              onClick={() => setShowFinish(true)}
            >
              Sınavı bitir
            </button>
          )}
        </div>
      </footer>

      {/* Harita */}
      {showMap ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" role="dialog" aria-modal>
          <div className="flex h-full w-full max-w-[360px] flex-col bg-[color:var(--cp-bg)] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Soru haritası</h2>
              <button type="button" className="text-sm text-[color:var(--cp-muted)]" onClick={() => setShowMap(false)}>
                Kapat
              </button>
            </div>
            <p className="mb-3 text-sm text-[color:var(--cp-muted)]">
              {answeredCount} yanıtlandı · {flagged.size} işaretli ·{" "}
              {questions.length - answeredCount} boş
            </p>
            <div className="grid grid-cols-5 gap-2 overflow-y-auto">
              {questions.map((q, i) => {
                const has =
                  Array.isArray(answers[q.id])
                    ? (answers[q.id] as string[]).length > 0
                    : Boolean(String(answers[q.id] ?? "").trim());
                return (
                  <button
                    key={q.id}
                    type="button"
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold",
                      i === index && "ring-2 ring-white",
                      has
                        ? "bg-[color:color-mix(in_srgb,var(--c-action)_20%,transparent)]"
                        : "bg-[color:var(--cp-surface-2)]",
                    )}
                    onClick={() => {
                      goTo(i);
                      setShowMap(false);
                    }}
                  >
                    {i + 1}
                    {flagged.has(q.id) ? (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[color:#f59e0b]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary mt-auto h-12 w-full rounded-full font-semibold"
              onClick={() => {
                setShowMap(false);
                setShowFinish(true);
              }}
            >
              Sınavı bitir
            </button>
          </div>
        </div>
      ) : null}

      {showFinish ? (
        <Modal
          title="Sınavı bitirmek istiyor musun?"
          body={`${questions.length} sorudan ${answeredCount}${possessiveAccusativeSuffix(answeredCount)} yanıtladın. ${questions.length - answeredCount} soru boş, ${flagged.size} soru işaretli.`}
          primaryLabel={loading ? "Değerlendiriliyor…" : "Evet, sınavı bitir"}
          primaryBusy={loading}
          onPrimary={() => void submit()}
          secondaryLabel="Sorulara dön"
          onSecondary={() => setShowFinish(false)}
          onClose={() => setShowFinish(false)}
        />
      ) : null}

      {showExit ? (
        <Modal
          title="Sınavdan çıkmak istiyor musun?"
          body="Süre işlemeye devam eder. Cevapların kaydedildi."
          primaryLabel="Sınava dön"
          onPrimary={() => setShowExit(false)}
          secondaryLabel="Çık"
          onSecondary={() => router.push(`/deneme-sinavlari/${prepId}`)}
          onClose={() => setShowExit(false)}
          dangerSecondary
        />
      ) : null}

      {timeUp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" role="alertdialog">
          <div className="rounded-2xl bg-[color:var(--cp-surface)] p-8 text-center">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-action" />
            <h2 className="text-xl font-semibold">Süre doldu</h2>
            <p className="mt-2 text-sm text-[color:var(--cp-muted)]">Cevapların gönderiliyor…</p>
          </div>
        </div>
      ) : null}

      <p className="sr-only">{multiMcqScoringNote()}</p>
      <p className="sr-only">{title}</p>
    </div>
  );
}

function Modal({
  title,
  body,
  primaryLabel,
  primaryBusy,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onClose,
  dangerSecondary,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  primaryBusy?: boolean;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  onClose: () => void;
  dangerSecondary?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface)] p-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--cp-muted)]">{body}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-45"
            disabled={primaryBusy}
            aria-busy={primaryBusy}
            onClick={onPrimary}
          >
            {primaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {primaryLabel}
          </button>
          <button
            type="button"
            className={cn(
              "h-11 flex-1 rounded-xl border px-5 text-sm font-semibold",
              dangerSecondary
                ? "border-[color:var(--pm-danger,#ef4444)] text-[color:var(--pm-danger,#ef4444)]"
                : "border-[color:var(--cp-border)] bg-[color:var(--cp-surface-2)]",
            )}
            onClick={onSecondary}
          >
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
