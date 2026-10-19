"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import {
  postStudio,
  StudioEntry,
  StudioFrame,
  StudioLoading,
  StudioPaywall,
  StudioProgress,
  StudioResults,
} from "@/components/learning/studio/studio-shared";
import { createRecognizer, speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";
import {
  documentSuggestions,
  sourceNotice,
  StudioChoices,
  StudioSetup,
  StudioSourcePicker,
  type StudioDocument,
  type StudioSourceMode,
} from "@/components/learning/studio/studio-setup";
import { cn } from "@/lib/utils";

/** expectedPoints: belgeden beklenen noktalar; puanlama bunlara göre yapılır (19 Ekim 2026). */
type Question = { prompt: string; hint?: string; expectedPoints?: string[] };

const QUESTION_COUNTS = [
  { value: 3, label: "3 soru" },
  { value: 5, label: "5 soru" },
  { value: 8, label: "8 soru" },
] as const;

const TURN_SECONDS = 45;

export function OralStudio({
  creditCost,
  initialTopic = "",
  documents = [],
  initialDocumentId = null,
}: {
  creditCost: number | null;
  initialTopic?: string;
  documents?: StudioDocument[];
  initialDocumentId?: string | null;
}) {
  const [sourceMode, setSourceMode] = useState<StudioSourceMode>(initialDocumentId ? "document" : "topic");
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId ?? documents[0]?.id ?? null);
  const [count, setCount] = useState<number>(5);
  const [notice, setNotice] = useState<string | null>(null);
  const sourceDocument = sourceMode === "document" ? documents.find((doc) => doc.id === documentId) ?? null : null;
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "grading" | "results">(
    "entry",
  );
  const [topic, setTopic] = useState(initialTopic);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(TURN_SECONDS);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [paywall, setPaywall] = useState(false);
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    stopSpeech();
    recRef.current?.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    setSeconds(TURN_SECONDS);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setSeconds((n) => {
        if (n <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [phase, index]);

  async function start(topic: string) {
    if (sourceMode === "document" && !sourceDocument) {
      toast.error(documentId ? "Belgen hâlâ hazırlanıyor; biter bitmez başlatabilirsin." : "Önce bir belge seç ya da yükle.");
      return;
    }
    setPhase("loading");
    const result = await postStudio<{
      title?: string;
      questions?: Question[];
      source?: { kind?: string; wholeDocument?: boolean; matched?: boolean; fileName?: string | null };
    }>("/api/learning/oral/generate", {
      topic,
      count,
      ...(sourceDocument ? { documentId: sourceDocument.id } : {}),
    });
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("entry");
      return;
    }
    if (!result.ok || !result.data.questions?.length) {
      toast.error(result.ok ? "Sözlü bu sefer tamamlanamadı; yeniden dene." : result.error);
      setPhase("entry");
      return;
    }
    setTopic(topic);
    setTitle(result.data.title ?? topic);
    setNotice(sourceNotice(result.data.source));
    setQuestions(result.data.questions);
    setIndex(0);
    setAnswer("");
    setAnswers([]);
    setScore(null);
    setPhase("play");
    speakTurkish(result.data.questions[0]?.prompt ?? "");
  }

  function listen() {
    const rec = createRecognizer();
    if (!rec) {
      toast.error("Bu tarayıcıda ses tanıma yok. Cevabı yazabilirsin.");
      return;
    }
    recRef.current?.stop();
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last?.[0]?.transcript ?? "";
      if (text) setAnswer(text);
    };
    rec.onerror = (event) => {
      setListening(false);
      const code = event?.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        toast.error("Mikrofon izni yok", {
          description: "İzni açabilir veya cevabı yazabilirsin.",
        });
      } else if (code === "no-speech") {
        toast.message("Ses algılanamadı", {
          description: "Yeniden dene veya cevabı yaz.",
        });
      }
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      toast.error("Mikrofon açılamadı. Cevabı yazabilirsin.");
    }
  }

  async function submitTurn() {
    const nextAnswers = [...answers, answer.trim() || "(sessiz)"];
    recRef.current?.stop();
    setListening(false);
    if (index + 1 < questions.length) {
      setAnswers(nextAnswers);
      setIndex((n) => n + 1);
      setAnswer("");
      speakTurkish(questions[index + 1]?.prompt ?? "");
      return;
    }
    setPhase("grading");
    const result = await postStudio<{
      score?: number;
      verdict?: string;
      feedback?: string;
      missingPoints?: string[];
      suggestedAnswer?: string;
    }>("/api/learning/oral/grade", {
      title,
      items: questions.map((q, i) => ({
        prompt: q.prompt,
        answer: nextAnswers[i] ?? "",
        ...(q.expectedPoints?.length ? { expectedPoints: q.expectedPoints } : {}),
      })),
    });
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("play");
      return;
    }
    if (!result.ok) {
      toast.error(
        result.error || "Değerlendirme yapılamadı. Kredin düşmedi.",
      );
      setPhase("play");
      return;
    }
    setScore(result.data.score ?? 0);
    const missing = (result.data.missingPoints ?? []).filter(Boolean);
    const suggested = result.data.suggestedAnswer?.trim();
    const parts = [
      result.data.feedback ?? result.data.verdict ?? "Değerlendirme hazır.",
    ];
    if (missing.length) {
      parts.push(`Eksik noktalar: ${missing.join("; ")}`);
    }
    // Önerilen cevap sorunun kopyasıysa gösterme (sunucu da temizler).
    if (suggested && !questions.some((q) => suggested.includes(q.prompt.slice(0, 24)))) {
      parts.push(`Önerilen cevap: ${suggested}`);
    }
    setFeedback(parts.join("\n\n"));
    setPhase("results");
  }

  const question = questions[index];

  return (
    <StudioFrame tool="sozlu" kicker="Sözlü deneme">
      {phase === "entry" ? (
        <StudioEntry
          tool="sozlu"
          title="Sözlü deneme"
          placeholder={sourceDocument ? "Örn. Belgenin tamamı ya da bir bölüm" : "Örn. Kurtuluş Savaşı"}
          submitLabel="Sözlüyü başlat"
          creditCost={creditCost}
          initialTopic={initialTopic}
          suggestions={documentSuggestions(sourceDocument)}
          setup={
            <StudioSetup>
              <StudioSourcePicker
                idPrefix="oral"
                documents={documents}
                mode={sourceMode}
                onModeChange={setSourceMode}
                documentId={documentId}
                onDocumentChange={setDocumentId}
              />
              <StudioChoices label="Kaç soru?" options={QUESTION_COUNTS} value={count} onChange={setCount} />
            </StudioSetup>
          }
          onSubmit={(next) => void start(next)}
        />
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="Jüri yerini alıyor" lead={`${count} soru${sourceDocument ? " belgenden" : ""}, her biri için süre ve net geri bildirim.`} />
      ) : null}

      {phase === "play" && question ? (
        <>
          <StudioProgress index={index} total={questions.length} />
          {notice && index === 0 ? <p className="ls-source-notice">{notice}</p> : null}
          <p className="ls-timer">{seconds}s</p>
          <h2 className="ls-question">{question.prompt}</h2>
          {question.hint ? <p className="ls-entry-lead">{question.hint}</p> : null}
          <div className="ls-player">
            <div
              className="ls-timer-ring"
              style={{ "--ls-left": (seconds / TURN_SECONDS) * 100 } as CSSProperties}
            >
            <button
              type="button"
              className={cn("ls-mic-orb", listening && "is-live")}
              onClick={listen}
              aria-pressed={listening}
            >
              <Mic className="h-8 w-8" aria-hidden />
            </button>
            </div>
            <p className="ls-credit">{listening ? "Dinleniyor…" : "Mikrofon veya yaz"}</p>
            <label className="sr-only" htmlFor="oral-answer">
              Cevabın
            </label>
            <textarea
              id="oral-answer"
              className="ls-script"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Cevabını buraya yaz veya mikrofona konuş."
            />
          </div>
          <div className="ls-actions">
            <button type="button" className="ls-cta" onClick={() => void submitTurn()}>
              {index + 1 >= questions.length ? "Bitir ve not al" : "Cevabı gönder"}
            </button>
          </div>
        </>
      ) : null}

      {phase === "grading" ? (
        <StudioLoading title="Notlanıyor" lead="Cevapların dinlendi, jüri konuşuyor." />
      ) : null}

      {phase === "results" ? (
        <StudioResults
          tool="sozlu"
          topic={topic}
          scoreLabel={score != null ? `%${score}` : undefined}
          title="Sözlü kapandı."
          lead={feedback}
          onAgain={() => {
            setIndex(0);
            setAnswer("");
            setAnswers([]);
            setPhase("play");
            speakTurkish(questions[0]?.prompt ?? "");
          }}
          onNew={() => {
            stopSpeech();
            setPhase("entry");
          }}
        />
      ) : null}

      <StudioPaywall
        open={paywall}
        onOpenChange={setPaywall}
        returnPath="/studio/sozlu"
        action="ORAL_EXAM_GENERATE"
        actionLabel="Sözlü deneme"
      />
    </StudioFrame>
  );
}
