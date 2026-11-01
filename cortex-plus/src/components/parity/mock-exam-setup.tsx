"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2, Printer, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import "@/styles/paper-exam.css";
import {
  clearStoredMockRun,
  mockProgressLine,
  monotonicProgress,
  pollGenerationJob,
  pollMockExamStatus,
  postMockExamWithProgress,
  readStoredMockRun,
  writeStoredMockRun,
  type MockExamProgress,
  type MockExamStatus,
  type StoredMockRun,
} from "@/lib/learning/mock-exam/progress";
import { CreditGate } from "@/components/paywall/credit-gate";
import {
  MOCK_MINUTES_MAX,
  MOCK_MINUTES_MIN,
  MOCK_MINUTES_STEP,
  UNTIMED_MINUTES,
} from "@/lib/learning/mock-exam/time-limit";
import {
  expandedAllocationNote,
  presetQuestionCount,
  promisedAllocation,
} from "@/lib/learning/mock-exam/allocate";
import { TWIN_EXAM_LABEL } from "@/lib/learning/mock-exam/past-questions";
import { MOCK_CUSTOM_MAX, MOCK_CUSTOM_MIN } from "@/lib/learning/mock-exam/types";

/** Uzunluk seçeneğinin önerdiği süre; öğrenci değiştirebilir. */
const PRESET_MINUTES = { short: 20, standard: 40 } as const;

/** "Kendi sınavım" (30 Ekim 2026, Paket I #4): öğrenci gerçek sınavın soru sayısını girer; süre önerisi soru başı 2 dk. */
type LengthChoice = "short" | "standard" | "real" | "custom";
const CUSTOM_MINUTES_PER_QUESTION = 2;

type Topic = {
  id: string;
  label: string;
  outOfScope?: boolean;
  examHeavy?: boolean;
  weightPercent?: number | null;
  officialCount?: number | null;
};

export function MockExamSetup({
  prepId,
  topics,
  formatSummary,
  realMinutes = null,
  realQuestionCount = null,
  pastQuestions = null,
  isAdmin,
}: {
  prepId: string;
  topics: Topic[];
  formatSummary: string | null;
  /** Belgedeki sınav biçiminin süresi ("Gerçek sınav biçimi"). */
  realMinutes?: number | null;
  /** Belgedeki sınav biçiminin soru sayısı. */
  realQuestionCount?: number | null;
  /** Belgedeki çıkmış sorular (Paket J3 #11): sayı ve ikiz sınavın konu ağırlıkları (konu kimliğiyle). */
  pastQuestions?: { count: number; weights: Record<string, number | null> } | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"all" | "topics">("all");
  const [twin, setTwin] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(topics.map((t) => t.id)));
  const [preset, setPreset] = useState<LengthChoice>(formatSummary ? "real" : "standard");
  const [customCount, setCustomCount] = useState(realQuestionCount && realQuestionCount >= MOCK_CUSTOM_MIN ? Math.min(MOCK_CUSTOM_MAX, realQuestionCount) : 25);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [progress, setProgress] = useState<MockExamProgress | null>(null);
  const [retryJobId, setRetryJobId] = useState<string | null>(null);
  const [retryResumeId, setRetryResumeId] = useState<string | null>(null);
  const [barOnly, setBarOnly] = useState(false);
  const bodyRef = useRef<Record<string, unknown> | null>(null);
  /** Süren kurulumun kimlikleri (29 Ekim 2026): tarayıcıya da yazılır, yenilemede yoklama sürer. */
  const runRef = useRef<StoredMockRun | null>(null);
  const watchRef = useRef<{ stop: () => void } | null>(null);
  const presetMinutes = (value: LengthChoice, count = customCount) =>
    value === "custom"
      ? Math.min(MOCK_MINUTES_MAX, Math.max(MOCK_MINUTES_MIN, count * CUSTOM_MINUTES_PER_QUESTION))
      : value === "real"
        ? (realMinutes ?? PRESET_MINUTES.standard)
        : PRESET_MINUTES[value];
  const countFor = (value: LengthChoice) => (value === "custom" ? customCount : presetQuestionCount(value, realQuestionCount));
  // Astra gibi serbest süre (1 Ekim 2026). Uzunluk değişince önerilen süreye döner.
  const [minutes, setMinutes] = useState(() => presetMinutes(formatSummary ? "real" : "standard"));
  const [untimed, setUntimed] = useState(false);
  /** Astra: "Nasıl çözmek istiyorsun?" — uygulamada ya da kâğıtta (17 Ekim 2026). */
  const [answerMode, setAnswerMode] = useState<"app" | "paper" | null>(null);
  const answerModeRef = useRef<"app" | "paper" | null>(null);
  answerModeRef.current = answerMode;

  const creditNote = isAdmin
    ? "Bu deneme kredi sınırından düşmez."
    : "Değerlendirme dahildir.";

  // Önizleme üretimin okuduğu fonksiyondan, seçilen uzunluk ve kapsamla (Paket A): gösterilen dağılım teslim edilir.
  const promisedFor = (value: LengthChoice) => {
    const pool = scope === "all" ? topics : topics.filter((t) => selected.has(t.id));
    return promisedAllocation(
      pool.map((t) => ({
        topicId: t.id,
        topicLabel: t.label,
        weightPercent: (twin && pastQuestions ? pastQuestions.weights[t.id] : null) ?? t.weightPercent ?? null,
        examHeavy: t.examHeavy ?? false,
        outOfScope: t.outOfScope ?? false,
        passageChars: 100,
        officialCount: t.officialCount ?? null,
      })),
      countFor(value),
    );
  };
  const promised = promisedFor(preset);
  const preview = promised.rows;
  const overflowNote = expandedAllocationNote(promised);

  // Çözüm yolu ref'ten: yenilemeden sonra yoklama bitince de doğru adrese gidilsin.
  function examHref(examId: string, answerMode: "app" | "paper" | null = answerModeRef.current) {
    return `/deneme-sinavlari/${prepId}/deneme/${examId}${answerMode === "paper" ? "?kagit=1" : ""}`;
  }

  /** Kimlikleri hem bellekte hem tarayıcıda tutar; `null` kaydı siler. */
  function rememberRun(patch: Partial<StoredMockRun> | null) {
    if (!patch) {
      runRef.current = null;
      clearStoredMockRun(prepId);
      return;
    }
    const next: StoredMockRun = {
      startedAt: runRef.current?.startedAt ?? new Date().toISOString(),
      ...runRef.current,
      ...patch,
    };
    runRef.current = next;
    writeStoredMockRun(prepId, next);
  }

  function stopWatch() {
    watchRef.current?.stop();
    watchRef.current = null;
  }

  /** Kâğıt hazır: kayıt silinir, yoklama durur, sınav açılır. */
  function openExam(examId: string) {
    stopWatch();
    rememberRun(null);
    router.push(examHref(examId));
  }

  /** Durum ucunun konu sayısı ekrana; sayı geri gitmez. */
  function applyStatusProgress(state: MockExamStatus) {
    if (state.state !== "running" || typeof state.topicTotal !== "number" || !state.topicTotal) return;
    const done = state.topicsReady ?? 0;
    setProgress((previous) => {
      const next = monotonicProgress(previous, { done, total: state.topicTotal ?? 0, label: previous?.label ?? null });
      return next ?? previous;
    });
  }

  /** Üretim POST'una paralel koşan durum yoklaması; `published` gelince POST döngüsü kesilir. */
  function statusWatch() {
    return {
      ids: () => ({
        prepId,
        since: runRef.current?.startedAt ?? new Date().toISOString(),
        resumeId: runRef.current?.resumeId ?? null,
        jobId: runRef.current?.jobId ?? null,
      }),
      onState: applyStatusProgress,
      onResume: (resumeId: string) => rememberRun({ resumeId }),
    };
  }

  /**
   * Sayfa yenilendi, kurulum sürüyordu: yalnız yoklanır. Kimse yazmıyorsa (`leaseAlive:false`)
   * aynı kâğıt bir POST ile devralınır — yeni kâğıt açılmaz, ikinci ücret yok.
   */
  function resumeWatch(run: StoredMockRun) {
    runRef.current = run;
    if (run.body && typeof run.body === "object") bodyRef.current = run.body;
    if (run.answerMode) {
      answerModeRef.current = run.answerMode;
      setAnswerMode(run.answerMode);
    }
    setLoading(true);
    setBarOnly(false);
    setRetryJobId(null);
    setRetryResumeId(null);
    if (run.jobId) {
      void followJob(run.jobId);
      return;
    }
    stopWatch();
    const watch = pollMockExamStatus(statusWatch().ids, (state) => {
      if (state.state === "running") {
        applyStatusProgress(state);
        if (state.leaseAlive === false && state.resumeId && watchRef.current === watch) {
          stopWatch();
          void continueResume(state.resumeId);
        }
        return;
      }
      if (state.state === "failed" && watchRef.current === watch) {
        stopWatch();
        if (state.resumeId) setRetryResumeId(state.resumeId);
        setLoading(false);
      }
    });
    watchRef.current = watch;
    void watch.done.then((hit) => {
      if (hit) {
        openExam(hit.examId);
        return;
      }
      if (watchRef.current !== watch) return;
      watchRef.current = null;
      setLoading(false);
    });
  }

  useEffect(() => {
    const stored = readStoredMockRun(prepId);
    if (stored) resumeWatch(stored);
    return () => stopWatch();
    // Yalnız açılışta: kayıt varsa yoklama sürer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepId]);

  async function followJob(jobId: string) {
    setBarOnly(true);
    setLoading(true);
    setRetryJobId(null);
    rememberRun({ jobId });
    try {
      const waited = await pollGenerationJob(jobId, setProgress);
      if (waited.examId) {
        openExam(waited.examId);
        return;
      }
      if (waited.failed) setRetryJobId(jobId);
    } catch {
      setRetryJobId(jobId);
    } finally {
      setLoading(false);
    }
  }

  async function retryJob(jobId: string) {
    setLoading(true);
    setRetryJobId(null);
    setBarOnly(true);
    try {
      const res = await fetch(`/api/learning/jobs/${jobId}/retry`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { jobId?: string; code?: string; error?: string };
      if (
        data.code === "insufficient_credits" ||
        data.error === "insufficient_credits" ||
        data.code === "premium_required"
      ) {
        rememberRun(null);
        setPaywall(true);
        setLoading(false);
        return;
      }
      if (!res.ok || !data.jobId) {
        setRetryJobId(jobId);
        setLoading(false);
        return;
      }
      await followJob(data.jobId);
    } catch {
      setRetryJobId(jobId);
      setLoading(false);
    }
  }

  function requestBody(extra?: { resumeId?: string; retry?: boolean }) {
    return {
      prepId,
      ...(preset === "custom" ? { questionCount: customCount } : { preset }),
      scope,
      topicIds: scope === "topics" ? [...selected] : undefined,
      durationMinutes: untimed ? UNTIMED_MINUTES : minutes,
      ...(twin && pastQuestions ? { twin: true } : {}),
      ...extra,
    };
  }

  function applyResult(status: number, data: Record<string, unknown>) {
    const payload = data as { error?: string; code?: string; examId?: string; jobId?: string; resumeId?: string };
    if (
      payload.error === "insufficient_credits" ||
      payload.code === "insufficient_credits" ||
      payload.code === "premium_required" ||
      payload.error === "premium_required"
    ) {
      rememberRun(null);
      setPaywall(true);
      setLoading(false);
      return;
    }
    if (payload.jobId && !payload.examId) {
      void followJob(payload.jobId);
      return;
    }
    if (payload.examId) {
      openExam(payload.examId);
      return;
    }
    const resume = typeof payload.resumeId === "string" ? payload.resumeId : null;
    if (resume && (payload.code === "budget_exceeded" || payload.error === "budget_exceeded" || status < 300)) {
      rememberRun({ resumeId: resume });
      setRetryResumeId(resume);
      setLoading(false);
      return;
    }
    if (status >= 300) toast.error("Yeniden dene.");
    setLoading(false);
  }

  async function continueResume(resumeId: string) {
    setLoading(true);
    setRetryResumeId(null);
    setBarOnly(false);
    const base = bodyRef.current ?? runRef.current?.body ?? requestBody();
    rememberRun({ resumeId, body: base, answerMode: answerModeRef.current });
    try {
      const { status, data } = await postMockExamWithProgress(
        "/api/learning/exam-prep/mock-exam",
        () => ({ ...base, resumeId, retry: true }),
        setProgress,
        { status: statusWatch() },
      );
      applyResult(status, data);
    } catch {
      setRetryResumeId(resumeId);
      setLoading(false);
    }
  }

  async function start() {
    setLoading(true);
    setProgress(null);
    setRetryJobId(null);
    setRetryResumeId(null);
    setBarOnly(false);
    const body = requestBody();
    bodyRef.current = body;
    stopWatch();
    // Yoklama bu andan sonraki kâğıda bakar; eski kâğıtlar bu isteğin değil.
    runRef.current = null;
    rememberRun({ startedAt: new Date().toISOString(), body, answerMode: answerModeRef.current, resumeId: null, jobId: null });
    try {
      // Üretim düşünce aynı kâğıt sürer (26 Ekim 2026). Yeni istek yalnız kâğıt yoksa açılır.
      // Durum yoklaması paralel (29 Ekim 2026): POST takılsa da yayımlanan kâğıt açılır.
      const { status, data } = await postMockExamWithProgress(
        "/api/learning/exam-prep/mock-exam",
        () => body,
        setProgress,
        { status: statusWatch() },
      );
      applyResult(status, data);
    } catch {
      toast.error("Yeniden dene.");
      setLoading(false);
    }
  }

  if (loading || retryJobId || retryResumeId) {
    const share = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="mx-auto max-w-[640px] px-4 py-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--c-action)]" />
        <h1 className="mt-4 text-xl font-semibold">Deneme sınavın hazırlanıyor…</h1>
        <div
          className="mx-auto mt-6 h-2 w-full max-w-[360px] overflow-hidden rounded-full bg-[color:var(--cp-surface-2,#1f1f1f)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress?.total ?? 0}
          aria-valuenow={progress?.done ?? 0}
          aria-label="Hazırlanıyor"
        >
          <div className="h-full bg-[var(--c-action)] transition-[width] duration-500" style={{ width: `${share}%` }} />
        </div>
        <p className="mt-3 text-sm text-[color:var(--cp-muted)]" aria-live="polite">
          {barOnly ? "Hazırlanıyor…" : mockProgressLine(progress ?? { done: 0, total: 0, label: null })}
        </p>
        {retryJobId ? (
          <button type="button" className="cp-exam-continue cp-exam-continue--primary mt-6 h-12 rounded-full px-5 text-sm font-semibold" onClick={() => void retryJob(retryJobId)}>
            Yeniden dene
          </button>
        ) : retryResumeId ? (
          <button type="button" className="cp-exam-continue cp-exam-continue--primary mt-6 h-12 rounded-full px-5 text-sm font-semibold" onClick={() => void continueResume(retryResumeId)}>
            Yeniden dene
          </button>
        ) : null}
      </div>
    );
  }

  if (!answerMode) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-8">
        <p className="text-xs font-semibold tracking-widest text-[color:var(--cp-gold,#f4ae0b)]">YAZILI DENEME</p>
        <h1 className="mt-2 text-[28px] leading-tight text-[color:var(--cp-text)]">Nasıl çözmek istiyorsun?</h1>
        <p className="mt-2 text-[15px] text-[color:var(--cp-muted)]">
          Uygulamada çöz ya da çalışma kâğıdını yazdırıp kâğıt üzerinde çöz.
        </p>
        <div className="cp-answer-modes">
          <button type="button" className="cp-answer-mode" onClick={() => setAnswerMode("app")}>
            <Smartphone className="h-6 w-6" aria-hidden />
            <strong>Uygulamada</strong>
            <span>Her soruyu alıştığın gibi burada cevapla.</span>
            <em>Uygulamayı seç</em>
          </button>
          <button type="button" className="cp-answer-mode" onClick={() => setAnswerMode("paper")}>
            <Printer className="h-6 w-6" aria-hidden />
            <strong>Kâğıtta</strong>
            <span>Çalışma kâğıdını yazdır, süre tutarak çöz ve değerlendirme için fotoğrafını çek. Bir yazıcın olmalı.</span>
            <em>Kâğıdı seç</em>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px] px-4 py-8">
      <button type="button" className="cp-answer-mode-back" onClick={() => setAnswerMode(null)}>
        {answerMode === "paper" ? "Kâğıtta çözülecek · değiştir" : "Uygulamada çözülecek · değiştir"}
      </button>
      <p className="text-xs font-semibold tracking-widest text-[color:var(--cp-gold,#f4ae0b)]">
        YAZILI DENEME
      </p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--cp-text)]">
        Gerçek sınav provası
      </h1>
      <p className="mt-2 text-[15px] text-[color:var(--cp-muted)]">
        Süre var, yardım yok. Açıklamalar sınavın sonunda.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Kapsam</h2>
        <div className="mt-2 flex rounded-xl border border-[color:var(--cp-border)] p-1">
          {(
            [
              ["all", "Tüm sınav"],
              ["topics", "Konuları seç"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "flex-1 rounded-lg py-2.5 text-sm font-semibold",
                scope === value
                  ? "bg-[color:color-mix(in_srgb,var(--c-action)_20%,transparent)] text-[color:var(--cp-text)]"
                  : "text-[color:var(--cp-muted)]",
              )}
              onClick={() => setScope(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {scope === "topics" ? (
          <ul className="mt-3 space-y-2">
            {topics.map((topic) => (
              <li key={topic.id}>
                <label
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-[color:var(--cp-border)] px-3 py-2.5 text-sm",
                    topic.outOfScope && "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={topic.outOfScope}
                    checked={selected.has(topic.id)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(topic.id);
                        else next.delete(topic.id);
                        return next;
                      });
                    }}
                  />
                  <span className="flex-1">{topic.label}</span>
                  {topic.outOfScope ? (
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[color:var(--cp-muted)]">
                      Kapsam dışı
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {pastQuestions ? (
        <section className="mt-8">
          <button
            type="button"
            aria-pressed={twin}
            onClick={() => setTwin((value) => !value)}
            className={`w-full rounded-2xl border p-4 text-left transition ${
              twin ? "border-[color:var(--cp-action)] bg-[color:var(--cp-surface-2)]" : "border-[color:var(--cp-border)]"
            }`}
          >
            <span className="block text-sm font-semibold">{TWIN_EXAM_LABEL}</span>
            <span className="mt-1 block text-xs text-[color:var(--cp-muted)]">
              Belgende {pastQuestions.count} çıkmış soru bulduk. Açarsan deneme onların konu dağılımını, soru kökü tarzını ve
              zorluğunu örnek alır; aynı soruları sormaz.
            </span>
            <span className="mt-2 inline-block text-xs font-semibold text-[color:var(--cp-action)]">
              {twin ? "Açık · ikiz sınav hazırlanacak" : "Açmak için dokun"}
            </span>
          </button>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Uzunluk</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["short", `Kısa · ${promisedFor("short").total || 10} soru · 20 dk`, null],
              ["standard", `Standart · ${promisedFor("standard").total || 20} soru · 40 dk`, null],
              ["real", formatSummary ? `Gerçek sınav biçimi · ${formatSummary}` : null, "ÖNERİLEN"],
              ["custom", `Kendi sınavım · ${customCount} soru`, null],
            ] as const
          )
            .filter((row) => row[1] != null)
            .map(([value, label, badge]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "relative rounded-2xl border p-4 text-left text-sm",
                  preset === value
                    ? "border-[var(--c-action)] bg-[color:color-mix(in_srgb,var(--c-action)_12%,transparent)]"
                    : "border-[color:var(--cp-border)] bg-[color:var(--cp-surface)]",
                )}
                onClick={() => {
                  setPreset(value);
                  setMinutes(presetMinutes(value));
                }}
              >
                {badge ? (
                  <span className="absolute right-2 top-2 rounded-full bg-[color:var(--cp-gold)] px-2 py-0.5 text-[10px] font-bold text-[#050505]">
                    {badge}
                  </span>
                ) : null}
                {label}
              </button>
            ))}
        </div>
        {preset === "custom" ? (
          <div className="cp-mock-time mt-3" role="group" aria-label="Soru sayısı">
            <button
              type="button"
              className="cp-mock-time-step"
              aria-label="Bir soru azalt"
              disabled={customCount <= MOCK_CUSTOM_MIN}
              onClick={() => {
                const next = Math.max(MOCK_CUSTOM_MIN, customCount - 1);
                setCustomCount(next);
                setMinutes(presetMinutes("custom", next));
              }}
            >
              −
            </button>
            <p className="cp-mock-time-value" aria-live="polite">
              <strong>{customCount}</strong> soru
            </p>
            <button
              type="button"
              className="cp-mock-time-step"
              aria-label="Bir soru artır"
              disabled={customCount >= MOCK_CUSTOM_MAX}
              onClick={() => {
                const next = Math.min(MOCK_CUSTOM_MAX, customCount + 1);
                setCustomCount(next);
                setMinutes(presetMinutes("custom", next));
              }}
            >
              +
            </button>
          </div>
        ) : null}
        {overflowNote ? (
          <p className="mt-3 text-sm text-[color:var(--cp-muted)]" role="note">
            {overflowNote}
          </p>
        ) : null}
      </section>

      <section className="mt-8" aria-labelledby="mock-time-title">
        <h2 id="mock-time-title" className="text-sm font-semibold">
          Süre
        </h2>
        <div className={cn("cp-mock-time", untimed && "is-off")}>
          <button
            type="button"
            className="cp-mock-time-step"
            aria-label={`${MOCK_MINUTES_STEP} dakika azalt`}
            disabled={untimed || minutes <= MOCK_MINUTES_MIN}
            onClick={() => setMinutes((value) => Math.max(MOCK_MINUTES_MIN, value - MOCK_MINUTES_STEP))}
          >
            −
          </button>
          <p className="cp-mock-time-value" aria-live="polite">
            {untimed ? (
              "Süresiz"
            ) : (
              <>
                <strong>{minutes}</strong> dk
              </>
            )}
          </p>
          <button
            type="button"
            className="cp-mock-time-step"
            aria-label={`${MOCK_MINUTES_STEP} dakika artır`}
            disabled={untimed || minutes >= MOCK_MINUTES_MAX}
            onClick={() => setMinutes((value) => Math.min(MOCK_MINUTES_MAX, value + MOCK_MINUTES_STEP))}
          >
            +
          </button>
        </div>
        <input
          type="range"
          className="cp-mock-time-range"
          min={MOCK_MINUTES_MIN}
          max={MOCK_MINUTES_MAX}
          step={MOCK_MINUTES_STEP}
          value={minutes}
          disabled={untimed}
          aria-label="Süre (dakika)"
          onChange={(event) => setMinutes(Number(event.target.value))}
        />
        <label className="cp-mock-time-toggle">
          <input type="checkbox" checked={untimed} onChange={(event) => setUntimed(event.target.checked)} />
          Süre sınırı yok
        </label>
      </section>

      {preview.length ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Soru dağılımı · toplam {promised.total} soru</h2>
          <ul className="mt-3 space-y-2">
            {preview.map((row) => (
              <li key={row.topicLabel} className="text-sm">
                <div className="mb-1 flex items-center gap-2">
                  {row.examHeavy ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--cp-gold)]" />
                  ) : (
                    <span className="h-1.5 w-1.5" />
                  )}
                  <span>
                    {row.topicLabel} · {row.count} soru
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-[color:color-mix(in_srgb,var(--c-action)_60%,transparent)]"
                    style={{
                      width: `${Math.min(100, row.count * 8)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex gap-3 rounded-2xl border border-[color:var(--cp-border)] bg-[color:var(--cp-surface-2)] p-4 text-sm text-[color:var(--cp-muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <ul className="list-disc space-y-1 pl-4">
          {answerMode === "paper" ? (
            <li>Kâğıdı yazdırıp süre tutarak çözersin; bitince her sayfanın fotoğrafını yüklersin, el yazını okuyup notlandırırız.</li>
          ) : (
            <li>Sınav sırasında ipucu ve sohbet kapalı.</li>
          )}
          <li>
            {untimed
              ? "Süre sınırı yok; bitirdiğinde cevaplarını sen gönderirsin."
              : "Süre bitince cevapların otomatik gönderilir."}
          </li>
          <li>Sayfayı kapatırsan kaldığın yerden devam edebilirsin.</li>
        </ul>
      </div>

      <button
        type="button"
        className="cp-exam-continue cp-exam-continue--primary mt-6 flex h-[52px] w-full items-center justify-center rounded-full text-[15px] font-semibold"
        onClick={() => void start()}
      >
        Sınavı başlat
      </button>
      <p className="mt-3 text-center text-[13px] text-[color:var(--cp-muted)]">{creditNote}</p>
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Yazılı deneme için kullanım hakkın yetmiyor."
        action="PRACTICE_EXAM_GENERATE"
        actionLabel="Yazılı deneme"
        returnPath={`/deneme-sinavlari/${prepId}`}
      />
    </div>
  );
}
