"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Loader2, Mic, Square, Timer, Volume2 } from "lucide-react";
import { speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";
import {
  isRecordingSupported,
  startRecording,
  transcribe,
  type Recorder,
} from "@/lib/learning/voice-recorder";
import {
  dontKnowNote,
  isDontKnow,
  type OralProbeKind,
  visibleProbe,
} from "@/lib/learning/oral-exam";
import type { OralTeacherMoodId } from "@/lib/learning/oral-exam-chrome";
import { oralDeskAnswer } from "@/lib/learning/oral-first-answer";

/**
 * Sözlü soru ekranı: küre + soru metni + mikrofon + yazılı yedek.
 * Mikrofon reddedilirse yazılı mod sürer.
 */
export function OralAnswerDesk({
  index,
  total,
  prompt,
  probeKind,
  hint,
  persona,
  minutes,
  value,
  busy,
  onChange,
  onAdvance,
  onFinish,
}: {
  index: number;
  total: number;
  prompt: string;
  probeKind: OralProbeKind;
  hint?: string | null;
  persona: OralTeacherMoodId;
  minutes: number;
  value: string;
  busy?: boolean;
  onChange: (value: string) => void;
  /** `firstAnswer`: takip sorusu açıldıysa takipten önceki cevap (notta ayrıca değerlendirilir). */
  onAdvance: (answer: string, firstAnswer?: string) => void;
  onFinish: (answer: string, firstAnswer?: string) => void;
}) {
  const [left, setLeft] = useState(minutes * 60);
  const [probe, setProbe] = useState<{ question: string; hint: string | null } | null>(null);
  const [follow, setFollow] = useState("");
  const [note, setNote] = useState("");
  const [micNote, setMicNote] = useState(
    isRecordingSupported() ? "" : "Mikrofon izni verilmedi. Cevaplarını yazarak verebilirsin.",
  );
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<"speaking" | "listening" | "thinking">("speaking");
  const [confirmBlank, setConfirmBlank] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const mainAnswer = useRef("");
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setProbe(null);
    setFollow("");
    setNote("");
    setConfirmBlank(false);
    setStatus("speaking");
    let cancelled = false;
    speakTurkish(prompt, {
      cancelled: () => cancelled,
      onEnd: () => {
        if (!cancelled) setStatus("listening");
      },
      onError: () => {
        if (!cancelled) setStatus("listening");
      },
    });
    return () => {
      cancelled = true;
      stopSpeech();
      recorder.current?.cancel();
      recorder.current = null;
    };
  }, [prompt, index]);

  useEffect(() => {
    setLeft(minutes * 60);
    const timer = window.setInterval(() => {
      setLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [minutes]);

  useEffect(() => {
    if (!recording) {
      setRecSec(0);
      return;
    }
    const timer = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  function finishNow() {
    const out = oralDeskAnswer({ probeOpen: Boolean(probe), firstAnswer: mainAnswer.current, follow, value });
    onFinish(out.answer, out.firstAnswer);
  }

  useEffect(() => {
    if (left === 0) finishNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code === "Space" && document.activeElement !== textRef.current && !recording) {
        event.preventDefault();
        void listen();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, value, follow, probe, busy]);

  function clock(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  async function listen() {
    setMicNote("");
    setStatus("listening");
    const next = await startRecording({ onLevel: setLevel });
    if (!next) {
      setMicNote("Mikrofon izni verilmedi. Cevaplarını yazarak verebilirsin.");
      return;
    }
    recorder.current = next;
    setRecording(true);
  }

  async function stopListen() {
    const current = recorder.current;
    recorder.current = null;
    setRecording(false);
    setLevel(0);
    setStatus("thinking");
    if (!current) return;
    const blob = await current.stop();
    if (!blob) {
      setMicNote("Sesini çözemedim. Tekrar konuş ya da yaz.");
      setStatus("listening");
      return;
    }
    const text = await transcribe(blob);
    if (!text) {
      setMicNote("Sesini çözemedim. Tekrar konuş ya da yaz.");
      setStatus("listening");
      return;
    }
    if (probe) setFollow((prev) => (prev ? `${prev} ${text}` : text));
    else onChange(value ? `${value} ${text}` : text);
    setStatus("listening");
  }

  function submit() {
    if (busy) return;
    if (probe) {
      const out = oralDeskAnswer({ probeOpen: true, firstAnswer: mainAnswer.current, follow, value });
      if (index + 1 < total) onAdvance(out.answer, out.firstAnswer);
      else onFinish(out.answer, out.firstAnswer);
      return;
    }
    if (isDontKnow(value)) {
      setNote(dontKnowNote());
      if (index + 1 < total) onAdvance(value.trim());
      else onFinish(value.trim());
      return;
    }
    const next = visibleProbe({
      answer: value,
      probeKind,
      persona,
      alreadyProbed: false,
      hint,
      question: prompt,
    });
    if (next) {
      mainAnswer.current = value.trim();
      setProbe(next);
      setFollow("");
      setStatus("speaking");
      speakTurkish(next.question, {
        onEnd: () => setStatus("listening"),
        onError: () => setStatus("listening"),
      });
      return;
    }
    if (index + 1 < total) onAdvance(value);
    else onFinish(value);
  }

  function markDontKnow() {
    if (!confirmBlank) {
      setConfirmBlank(true);
      return;
    }
    onChange("bilmiyorum");
    if (index + 1 < total) onAdvance("bilmiyorum");
    else onFinish("bilmiyorum");
  }

  const currentValue = probe ? follow : value;
  const statusLabel = recording
    ? "🎙️ Seni dinliyorum..."
    : status === "speaking"
      ? "Öğretmen konuşuyor…"
      : status === "thinking"
        ? "Öğretmen düşünüyor…"
        : "Öğretmen dinliyor";
  const orbScale = recording ? 0.92 + Math.min(0.55, level * 1.4) : 1;

  return (
    <section className="cp-oral cp-oral-desk">
      <header className="cp-oral-desk-bar">
        <span className="cp-oral-chip">Soru {index + 1}/{total}</span>
        <span className={`cp-oral-timer-pill${left <= 60 ? " is-urgent" : ""}`}>
          <Timer className="h-4 w-4" aria-hidden />
          {clock(left)}
        </span>
        <button
          type="button"
          className="cp-oral-end-btn"
          onClick={finishNow}
        >
          Sınavı bitir
        </button>
      </header>

      <div
        className={`cp-oral-orb-wrap is-${status}${recording ? " is-recording" : ""}`}
        style={{ "--cp-oral-level": String(orbScale) } as CSSProperties}
        aria-hidden
      >
        <div className="pm-orb cp-oral-orb" />
      </div>
      <p className="cp-oral-status" aria-live="polite">
        {statusLabel}
      </p>
      {recording ? (
        <p className="cp-oral-listen-clock" aria-live="polite">
          {clock(recSec)}
        </p>
      ) : null}

      <article className="cp-oral-question-card">
        <h1>{prompt}</h1>
        <button
          type="button"
          className="cp-oral-textbtn"
          onClick={() => {
            setStatus("speaking");
            speakTurkish(probe?.question || prompt, {
              onEnd: () => setStatus("listening"),
              onError: () => setStatus("listening"),
            });
          }}
        >
          <Volume2 className="h-4 w-4" aria-hidden />
          Soruyu dinle
        </button>
      </article>

      {probe ? (
        <div className="cp-oral-probe" role="status">
          <p className="cp-oral-probe-label">Öğretmen soruyor</p>
          <strong>{probe.question}</strong>
          {probe.hint ? <p>İpucu: {probe.hint}</p> : null}
        </div>
      ) : null}

      {note ? <p role="status">{note}</p> : null}
      {micNote ? <p role="status" className="cp-oral-mic-banner">{micNote}</p> : null}

      <div className="cp-oral-answer-block">
        <button
          type="button"
          className={`cp-oral-mic-btn${recording ? " is-recording" : ""}`}
          aria-label={recording ? "Kaydı bitir" : "Konuşarak cevapla"}
          onClick={() => (recording ? void stopListen() : void listen())}
        >
          {recording ? <Square className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
        </button>
        <p className="cp-oral-mic-label">
          {recording ? `Kaydı bitir · ${clock(recSec)}` : "Konuşarak cevapla"}
        </p>
        <textarea
          ref={textRef}
          className="cp-exam-oral-input"
          rows={3}
          aria-label={probe ? "Takip cevabın" : "Cevabın"}
          placeholder="Konuşarak veya yazarak yanıtla"
          value={currentValue}
          onChange={(event) => (probe ? setFollow(event.target.value) : onChange(event.target.value))}
        />
      </div>

      <div className="cp-oral-desk-footer">
        <button type="button" className="cp-oral-ghost" onClick={markDontKnow}>
          {confirmBlank ? "Emin misin? Boş bırak" : "Bilmiyorum"}
        </button>
        <button
          type="button"
          className="cp-oral-cta"
          disabled={busy || (!probe && !value.trim()) || (Boolean(probe) && !follow.trim())}
          aria-busy={busy}
          onClick={submit}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Gönderiliyor…
            </>
          ) : (
            "Cevabı gönder"
          )}
        </button>
      </div>
    </section>
  );
}
