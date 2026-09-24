"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createRecognizer,
  speakTurkish,
  stopSpeech,
} from "@/lib/learning/studio-speech";
import {
  isRecordingSupported,
  speakFromServer,
  startRecording,
  transcribe,
  type Recorder,
} from "@/lib/learning/voice-recorder";
import { CreditGate } from "@/components/paywall/credit-gate";
import { OralEndDialog } from "@/components/parity/oral-exam-flow";
import {
  ORAL_LIMIT_MINUTES,
  oralLiveStatus,
  type OralTeacherMoodId,
} from "@/lib/learning/oral-exam-chrome";
import { X } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";

type Msg = { role: "user" | "assistant"; content: string };

export function ExamVoiceTutor({
  prepId,
  nodeId,
  kind,
  topicLabel,
  difficulty,
  returnPath,
  teacherStyle,
  submitting = false,
  onFinish,
}: {
  prepId: string;
  nodeId: string;
  kind: "qa" | "oral";
  topicLabel: string;
  difficulty: "kolay" | "orta" | "ileri";
  returnPath: string;
  /** Sözlü kabuktaki hava. Soru-cevap turunda gönderilmez. */
  teacherStyle?: OralTeacherMoodId;
  submitting?: boolean;
  onFinish: (turns: number, messages?: Msg[]) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<"thinking" | "speaking" | "listening" | "idle">(
    "thinking",
  );
  const [caption, setCaption] = useState("");
  const [paywall, setPaywall] = useState(false);
  const recRef = useRef<Recorder | null>(null);
  const voiceRef = useRef<{ stop: () => void } | null>(null);
  const browserRecRef = useRef<ReturnType<typeof createRecognizer>>(null);
  // null = henuz bilinmiyor. Ilk seslendirme denemesi belirliyor.
  const serverVoice = useRef<boolean | null>(null);
  const stopped = useRef(false);
  const paused = useRef(false);
  const speechAbort = useRef<AbortController | null>(null);
  const speakGen = useRef(0);
  const [endOpen, setEndOpen] = useState(false);

  const cutSpeech = useCallback(() => {
    speakGen.current += 1;
    speechAbort.current?.abort();
    speechAbort.current = null;
    stopSpeech();
    voiceRef.current?.stop();
    voiceRef.current = null;
    browserRecRef.current?.stop();
    browserRecRef.current = null;
    const recorder = recRef.current;
    recRef.current = null;
    recorder?.cancel();
    setPhase("idle");
    setCaption("");
  }, []);

  const openEndDialog = useCallback(() => {
    paused.current = true;
    cutSpeech();
    setEndOpen(true);
  }, [cutSpeech]);

  useEffect(() => {
    stopped.current = false;
    void turn([]);
    return () => {
      stopped.current = true;
      speakGen.current += 1;
      speechAbort.current?.abort();
      stopSpeech();
      voiceRef.current?.stop();
      browserRecRef.current?.stop();
      recRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (kind !== "oral") return;
    const timer = window.setTimeout(() => openEndDialog(), ORAL_LIMIT_MINUTES * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [kind, openEndDialog]);

  async function turn(history: Msg[], userLine?: string) {
    if (stopped.current || paused.current) return;
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
          ...(kind === "oral" && teacherStyle ? { teacherStyle } : {}),
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
      if (stopped.current) return;
      const reply = String(payload.reply ?? "");
      const withReply = [...nextHistory, { role: "assistant" as const, content: reply }];
      setMessages(withReply);
      // Bitirme penceresi açıkken yanıt kayda geçer ama ses başlamaz.
      if (paused.current) return;
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
  // dersi sessiz bırakmıyor. Sunucu sesi premium — gelmezse tarayıcıya düşüyoruz.
  function speechEnded() {
    return stopped.current || paused.current;
  }

  async function speak(text: string, onEnd: () => void) {
    if (speechEnded()) return;
    setPhase("speaking");
    setCaption("Eğitmen konuşuyor…");

    const gen = ++speakGen.current;
    speechAbort.current?.abort();
    const controller = new AbortController();
    speechAbort.current = controller;
    const stale = () => speechEnded() || gen !== speakGen.current;

    const handle = await speakFromServer(
      text,
      "ada",
      () => {
        voiceRef.current = null;
        if (!stale()) onEnd();
      },
      controller.signal,
    );
    if (stale()) {
      handle?.stop();
      return;
    }
    // İlk denemenin sonucu kulakları da belirliyor: sunucu sesi varsa sunucu
    // çözümlemesi de vardır. Böylece premium bilgisini prop olarak taşımaya
    // gerek kalmıyor ve iki taraf hep aynı sistemde kalıyor.
    serverVoice.current = Boolean(handle);
    if (handle) {
      voiceRef.current = handle;
      return;
    }

    speakTurkish(text, {
      cancelled: stale,
      onEnd: () => {
        if (!stale()) onEnd();
      },
      // Konuşamadıysak da akış tıkanmasın; sıradaki adıma geçiyoruz.
      onError: () => {
        if (!stale()) onEnd();
      },
    });
  }

  /** Ücretsiz taraf: tarayıcının kendi tanıma API'si. Bize maliyeti yok. */
  function listenInBrowser(history: Msg[]) {
    const rec = createRecognizer();
    if (!rec) {
      setPhase("idle");
      setCaption("Sesli yanıt bu tarayıcıda yok; yazarak sürebilirsin.");
      return;
    }
    browserRecRef.current?.stop();
    browserRecRef.current = rec;
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
      setCaption("Mikrofon durdu. Tekrar konuş veya yazarak sür.");
    };
    try {
      rec.start();
    } catch {
      setPhase("idle");
      setCaption("Mikrofon açılamadı; yazarak sürebilirsin.");
    }
  }

  /**
   * Kayıt sessizlikle kendiliğinden biter, sonra sunucuda çözümlenir.
   * Tarayıcı tanıma API'sinden ayrıldık: o yalnız Chrome'da çalışıyordu.
   */
  async function listen(history: Msg[]) {
    if (stopped.current || paused.current) return;
    stopSpeech();

    // Sunucu sesi yoksa (ücretsiz kullanıcı) sunucu çözümlemesi de yok.
    if (serverVoice.current === false) {
      listenInBrowser(history);
      return;
    }

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
    if (stopped.current || paused.current) {
      recorder.cancel();
      return;
    }
    recRef.current = recorder;
  }

  async function finishListening(history: Msg[]) {
    const recorder = recRef.current;
    if (!recorder || stopped.current || paused.current) return;
    recRef.current = null;

    setPhase("thinking");
    setCaption("Anlıyorum…");
    const blob = await recorder.stop();
    if (stopped.current || paused.current) return;
    if (!blob) {
      setPhase("idle");
      setCaption("Sesini alamadım. Tekrar dene veya yazarak sür.");
      return;
    }

    const text = await transcribe(blob);
    if (stopped.current || paused.current) return;
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
    cutSpeech();
    setCaption("Durduruldu.");
  }

  function confirmEnd() {
    // Bitiş duraklatma değil. Geç gelen sunucu sesi de onEnd de yok sayılır.
    stopped.current = true;
    paused.current = true;
    cutSpeech();
    onFinish(messages.filter((message) => message.role === "user").length, messages);
  }

  if (kind === "oral") {
    return (
      <section className="cp-oral cp-oral-live">
        <header className="cp-oral-bar">
          <span />
          <p>Sözlü Deneme Sınavı</p>
          <button type="button" className="cp-oral-icon" aria-label="Kapat" onClick={openEndDialog}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="cp-oral-live-stage">
          <p className="cp-oral-brand">
            <CortexMark size={26} />
            <span>cortex</span>
          </p>
          <div
            className={`cp-tutor-orb cp-oral-orb ${phase === "speaking" ? "is-talk" : ""} ${phase === "listening" ? "is-listen" : ""}`}
            aria-hidden
          />
          <p className="cp-oral-status">{oralLiveStatus(phase, caption)}</p>
          {phase === "listening" ? (
            <button type="button" className="cp-oral-textbtn" onClick={() => void finishListening(messages)}>
              Bitirdim
            </button>
          ) : null}
          {phase === "idle" ? (
            <button
              type="button"
              className="cp-oral-textbtn"
              onClick={() => {
                paused.current = false;
                void listen(messages);
              }}
            >
              Tekrar konuş
            </button>
          ) : null}
        </div>
        <button type="button" className="cp-oral-end" onClick={openEndDialog}>
          Sınavı bitir
        </button>
        {endOpen ? (
          <OralEndDialog
            busy={submitting}
            onStay={() => {
              if (submitting) return;
              stopped.current = false;
              paused.current = false;
              setEndOpen(false);
              const last = [...messages].reverse().find((message) => message.role === "assistant");
              if (!last?.content) return;
              void speak(last.content, () => {
                void listen(messages);
              });
            }}
            onConfirm={confirmEnd}
          />
        ) : null}
        <CreditGate
          open={paywall}
          onOpenChange={setPaywall}
          message="Sesli ders için kredin kalmadı."
          returnPath={returnPath}
        />
      </section>
    );
  }

  return (
    <section className="cp-tutor">
      <div
        className={`cp-tutor-orb ${phase === "speaking" ? "is-talk" : ""} ${phase === "listening" ? "is-listen" : ""}`}
        aria-hidden
      />
      <p className="cp-tutor-caption">{caption}</p>

      <div className="cp-tutor-log">
        {messages.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={message.role === "user" ? "cp-exam-intake-user" : "cp-exam-intake-ai"}
          >
            {message.content}
          </p>
        ))}
      </div>

      <div className="cp-tutor-actions">
        {phase === "listening" ? (
          // Kayıt sessizlikle kendiliğinden biter; bu düğüm sessizliği
          // beklemek istemeyen için.
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary"
            onClick={() => void finishListening(messages)}
          >
            Bitirdim
          </button>
        ) : phase === "speaking" || phase === "thinking" ? (
          <button type="button" className="cp-exam-continue cp-exam-continue--primary" onClick={stopAll}>
            Durdur
          </button>
        ) : (
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary"
            onClick={() => void listen(messages)}
          >
            Konuş
          </button>
        )}
        <button
          type="button"
          className="cp-exam-continue"
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
