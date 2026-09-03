"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";
import {
  isRecordingSupported,
  speakFromServer,
  startRecording,
  transcribe,
  type Recorder,
} from "@/lib/learning/voice-recorder";
import { CreditGate } from "@/components/paywall/credit-gate";

type Msg = { role: "user" | "assistant"; content: string };

export function ExamVoiceTutor({
  prepId,
  nodeId,
  kind,
  topicLabel,
  difficulty,
  returnPath,
  onFinish,
}: {
  prepId: string;
  nodeId: string;
  kind: "qa" | "oral";
  topicLabel: string;
  difficulty: "kolay" | "orta" | "ileri";
  returnPath: string;
  onFinish: (turns: number) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<"thinking" | "speaking" | "listening" | "idle">(
    "thinking",
  );
  const [caption, setCaption] = useState("");
  const [paywall, setPaywall] = useState(false);
  const recRef = useRef<Recorder | null>(null);
  const voiceRef = useRef<{ stop: () => void } | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    void turn([]);
    return () => {
      stopped.current = true;
      stopSpeech();
      voiceRef.current?.stop();
      recRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function turn(history: Msg[], userLine?: string) {
    if (stopped.current) return;
    const nextHistory = userLine
      ? [...history, { role: "user" as const, content: userLine }]
      : history;
    if (userLine) setMessages(nextHistory);
    setPhase("thinking");
    setCaption("Eğitmen düşünüyor…");
    try {
      const res = await fetch("/api/learning/exam-prep/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          nodeId,
          kind,
          topicLabel,
          difficulty,
          messages: nextHistory,
        }),
      });
      if (res.status === 402) {
        setPaywall(true);
        setPhase("idle");
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Eğitmen yanıt veremedi.");
        setPhase("idle");
        return;
      }
      const reply = String(payload.reply ?? "");
      const withReply = [...nextHistory, { role: "assistant" as const, content: reply }];
      setMessages(withReply);
      void speak(reply, () => {
        if (payload.done) {
          setPhase("idle");
          setCaption("Oturum bitti.");
          return;
        }
        void listen(withReply);
      });
    } catch {
      toast.error("Bağlantı hatası.");
      setPhase("idle");
    }
  }

  // Eğitmenin sesi sunucudan geliyor; cihazda Türkçe ses olmaması artık
  // dersi sessiz bırakmıyor. Sunucu sesi gelmezse tarayıcıya düşüyoruz.
  async function speak(text: string, onEnd: () => void) {
    if (stopped.current) return;
    setPhase("speaking");
    setCaption("Eğitmen konuşuyor…");

    const handle = await speakFromServer(text, "ada", () => {
      voiceRef.current = null;
      if (!stopped.current) onEnd();
    });
    if (stopped.current) {
      handle?.stop();
      return;
    }
    if (handle) {
      voiceRef.current = handle;
      return;
    }

    speakTurkish(text, () => {
      if (!stopped.current) onEnd();
    });
  }

  /**
   * Kayıt sessizlikle kendiliğinden biter, sonra sunucuda çözümlenir.
   * Tarayıcı tanıma API'sinden ayrıldık: o yalnız Chrome'da çalışıyordu.
   */
  async function listen(history: Msg[]) {
    if (stopped.current) return;
    stopSpeech();

    if (!isRecordingSupported()) {
      setPhase("idle");
      setCaption("Mikrofon bu tarayıcıda yok; yazarak da sürebilirsin.");
      return;
    }

    recRef.current?.cancel();
    setPhase("listening");
    setCaption("Seni dinliyorum…");

    const recorder = await startRecording({
      onAutoStop: () => void finishListening(history),
    });
    if (!recorder) {
      setPhase("idle");
      setCaption("Mikrofon açılamadı; yazarak da sürebilirsin.");
      return;
    }
    if (stopped.current) {
      recorder.cancel();
      return;
    }
    recRef.current = recorder;
  }

  async function finishListening(history: Msg[]) {
    const recorder = recRef.current;
    if (!recorder || stopped.current) return;
    recRef.current = null;

    setPhase("thinking");
    setCaption("Anlıyorum…");
    const blob = await recorder.stop();
    if (stopped.current) return;
    if (!blob) {
      setPhase("idle");
      setCaption("Sesini alamadım. Tekrar dene veya yazarak sür.");
      return;
    }

    const text = await transcribe(blob);
    if (stopped.current) return;
    if (!text) {
      setPhase("idle");
      setCaption("Söylediğini çözemedim. Tekrar dene veya yazarak sür.");
      return;
    }

    setCaption(text);
    void turn(history, text);
  }

  function stopAll() {
    stopped.current = true;
    stopSpeech();
    voiceRef.current?.stop();
    voiceRef.current = null;
    recRef.current?.cancel();
    recRef.current = null;
    setPhase("idle");
    setCaption("Durduruldu.");
  }

  return (
    <section className="ap-tutor">
      <div
        className={`ap-tutor-orb ${phase === "speaking" ? "is-talk" : ""} ${phase === "listening" ? "is-listen" : ""}`}
        aria-hidden
      />
      <p className="ap-tutor-caption">{caption}</p>

      <div className="ap-tutor-log">
        {messages.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={message.role === "user" ? "ap-exam-intake-user" : "ap-exam-intake-ai"}
          >
            {message.content}
          </p>
        ))}
      </div>

      <div className="ap-tutor-actions">
        {phase === "listening" ? (
          // Kayıt sessizlikle kendiliğinden biter; bu düğüm sessizliği
          // beklemek istemeyen için.
          <button
            type="button"
            className="ap-exam-continue ap-exam-continue--primary"
            onClick={() => void finishListening(messages)}
          >
            Bitirdim
          </button>
        ) : phase === "speaking" || phase === "thinking" ? (
          <button type="button" className="ap-exam-continue ap-exam-continue--primary" onClick={stopAll}>
            Durdur
          </button>
        ) : (
          <button
            type="button"
            className="ap-exam-continue ap-exam-continue--primary"
            onClick={() => void listen(messages)}
          >
            Konuş
          </button>
        )}
        <button
          type="button"
          className="ap-exam-continue"
          onClick={() => {
            stopAll();
            onFinish(messages.filter((m) => m.role === "user").length);
          }}
        >
          Bitir
        </button>
      </div>

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Sesli ders için kredin kalmadı."
        returnPath={returnPath}
      />
    </section>
  );
}
