"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createRecognizer,
  speakTurkish,
  stopSpeech,
} from "@/lib/learning/studio-speech";
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
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    void turn([]);
    return () => {
      stopped.current = true;
      stopSpeech();
      recRef.current?.stop();
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
      speak(reply, () => {
        if (payload.done) {
          setPhase("idle");
          setCaption("Oturum bitti.");
          return;
        }
        listen(withReply);
      });
    } catch {
      toast.error("Bağlantı hatası.");
      setPhase("idle");
    }
  }

  function speak(text: string, onEnd: () => void) {
    if (stopped.current) return;
    setPhase("speaking");
    setCaption("Eğitmen konuşuyor…");
    speakTurkish(text, () => {
      if (!stopped.current) onEnd();
    });
  }

  function listen(history: Msg[]) {
    if (stopped.current) return;
    stopSpeech();
    const rec = createRecognizer();
    if (!rec) {
      setPhase("idle");
      setCaption("Mikrofon bu tarayıcıda yok; yazarak da sürebilirsin.");
      return;
    }
    recRef.current?.stop();
    recRef.current = rec;
    rec.continuous = false;
    rec.interimResults = true;
    setPhase("listening");
    setCaption("Seni dinliyorum…");
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript?.trim() ?? "";
      if (transcript) setCaption(transcript);
      const isFinal =
        typeof (last as { isFinal?: boolean })?.isFinal === "boolean"
          ? Boolean((last as { isFinal?: boolean }).isFinal)
          : transcript.length > 0;
      if (isFinal && transcript) {
        rec.stop();
        void turn(history, transcript);
      }
    };
    rec.onerror = () => {
      setPhase("idle");
      setCaption("Mikrofon durdu. Tekrar konuş veya bitir.");
    };
    rec.onend = () => {
      if (phase === "listening") setPhase("idle");
    };
    try {
      rec.start();
    } catch {
      setPhase("idle");
      toast.error("Mikrofon açılamadı.");
    }
  }

  function stopAll() {
    stopped.current = true;
    stopSpeech();
    recRef.current?.stop();
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
        {phase === "speaking" || phase === "thinking" ? (
          <button type="button" className="ap-exam-continue ap-exam-continue--primary" onClick={stopAll}>
            Durdur
          </button>
        ) : (
          <button
            type="button"
            className="ap-exam-continue ap-exam-continue--primary"
            onClick={() => listen(messages)}
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
