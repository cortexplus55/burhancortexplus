"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Sözlü soru hem okunur hem söylenir. Cevap yazılır veya konuşulur.
 * Mikrofon reddedilirse yazı kutusu durur.
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
  onAdvance: (answer: string) => void;
  onFinish: (answer: string) => void;
}) {
  const [left, setLeft] = useState(minutes * 60);
  const [probe, setProbe] = useState<{ question: string; hint: string | null } | null>(null);
  const [follow, setFollow] = useState("");
  const [note, setNote] = useState("");
  const [micNote, setMicNote] = useState(
    isRecordingSupported() ? "" : "Mikrofon yok. Yazarak cevaplayabilirsin.",
  );
  const [recording, setRecording] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const mainAnswer = useRef("");

  useEffect(() => {
    setProbe(null);
    setFollow("");
    setNote("");
    let cancelled = false;
    speakTurkish(prompt, { cancelled: () => cancelled });
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
    if (left === 0) onFinish(value);
    // Süre bitince bir kez biter; her tuşta yeniden bağlanmasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  function clock(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  async function listen() {
    setMicNote("");
    const next = await startRecording({});
    if (!next) {
      setMicNote("Mikrofon kapalı. Yazarak cevaplayabilirsin.");
      return;
    }
    recorder.current = next;
    setRecording(true);
  }

  async function stopListen() {
    const current = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (!current) return;
    const blob = await current.stop();
    if (!blob) {
      setMicNote("Ses alınamadı. Yazarak cevaplayabilirsin.");
      return;
    }
    const text = await transcribe(blob);
    if (!text) {
      setMicNote("Söylediğin yazıya dökülemedi. Yazarak cevaplayabilirsin.");
      return;
    }
    if (probe) setFollow((prev) => (prev ? `${prev} ${text}` : text));
    else onChange(value ? `${value} ${text}` : text);
  }

  function submit() {
    if (probe) {
      const combined = [mainAnswer.current, follow.trim()].filter(Boolean).join("\n");
      if (index + 1 < total) onAdvance(combined);
      else onFinish(combined);
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
    });
    if (next) {
      mainAnswer.current = value.trim();
      setProbe(next);
      setFollow("");
      speakTurkish(next.question, {});
      return;
    }
    if (index + 1 < total) onAdvance(value);
    else onFinish(value);
  }

  return (
    <section className="cp-oral cp-oral-desk">
      <p className="cp-lesson-kicker">
        Soru {index + 1}/{total}
        <span className="cp-exam-timer"> {clock(left)}</span>
      </p>
      <h1>{prompt}</h1>
      <p className="cp-oral-status">Soru ekranda. İstersen sesli dinle, cevabı konuş veya yaz.</p>
      <button type="button" className="cp-oral-textbtn" onClick={() => speakTurkish(probe?.question || prompt, {})}>
        Soruyu dinle
      </button>
      {probe ? (
        <div className="cp-oral-probe" role="status">
          <strong>{probe.question}</strong>
          {probe.hint ? <p>İpucu: {probe.hint}</p> : null}
        </div>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
      <textarea
        className="cp-exam-oral-input"
        rows={4}
        aria-label={probe ? "Takip cevabın" : "Cevabın"}
        placeholder={probe ? "Takip cevabın" : "Konuşarak veya yazarak yanıtla"}
        value={probe ? follow : value}
        onChange={(event) => (probe ? setFollow(event.target.value) : onChange(event.target.value))}
      />
      {micNote ? <p role="status">{micNote}</p> : null}
      <div className="cp-oral-result-actions">
        {recording ? (
          <button type="button" className="cp-oral-ghost" onClick={() => void stopListen()}>
            Bitirdim
          </button>
        ) : (
          <button type="button" className="cp-oral-ghost" onClick={() => void listen()}>
            Konuş
          </button>
        )}
        <button type="button" className="cp-oral-cta" disabled={busy} onClick={submit}>
          {index + 1 < total ? "Sonraki soru" : "Bitir"}
        </button>
      </div>
    </section>
  );
}
