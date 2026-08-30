"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
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
import { playPlusTone } from "@/lib/learning/studio-sound";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import { cn } from "@/lib/utils";

type Item = { id: string; text: string; correct: boolean; explanation: string };

export function TrueFalseStudio({
  creditCost,
  initialTopic = "",
}: {
  creditCost: number | null;
  initialTopic?: string;
}) {
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "reveal" | "results">(
    "entry",
  );
  const [topic, setTopic] = useState(initialTopic);
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [paywall, setPaywall] = useState(false);
  const isPlus = Boolean(useStudentShellAccount()?.isPremium);

  const item = items[index];

  async function start(topic: string) {
    setPhase("loading");
    const result = await postStudio<{ items?: Item[] }>(
      "/api/learning/true-false/generate",
      { topic },
    );
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("entry");
      return;
    }
    if (!result.ok || !result.data.items?.length) {
      toast.error(result.ok ? "Tur üretilemedi." : result.error);
      setPhase("entry");
      return;
    }
    setTopic(topic);
    setItems(result.data.items);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setPhase("play");
  }

  function choose(value: boolean) {
    if (phase !== "play" || !item) return;
    setPicked(value);
    const ok = value === item.correct;
    if (ok) setScore((n) => n + 1);
    if (isPlus) playPlusTone(ok ? "correct" : "wrong");
    setPhase("reveal");
  }

  function next() {
    if (index + 1 >= items.length) {
      setPhase("results");
      return;
    }
    setIndex((n) => n + 1);
    setPicked(null);
    setPhase("play");
  }

  return (
    <StudioFrame tool="tf" kicker="Doğru / Yanlış">
      {phase === "entry" ? (
        <StudioEntry
          tool="tf"
          title="İki kapı. Bir gerçek."
          lead="Her kart tek bir iddia. Doğru mu, yanlış mı — hızlı, net, sinematik."
          placeholder="Örn. Fotosentez"
          submitLabel="Turu başlat"
          creditCost={creditCost}
          loading={false}
          initialTopic={initialTopic}
          onSubmit={(next) => void start(next)}
        />
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="İddialar hazırlanıyor" lead="Kısa, keskin, tek cümlelik gerçekler." />
      ) : null}

      {(phase === "play" || phase === "reveal") && item ? (
        <>
          <StudioProgress index={index} total={items.length} />
          <h2 className="ls-question">{item.text}</h2>
          <div className="ls-tf-grid">
            <button
              type="button"
              disabled={phase === "reveal"}
              className={cn(
                "ls-tf-card ls-tf-card--yes",
                picked === true && "is-selected",
                phase === "reveal" && item.correct && "is-correct",
                phase === "reveal" && picked === true && !item.correct && "is-wrong",
              )}
              onClick={() => choose(true)}
            >
              <Check className="h-7 w-7" aria-hidden />
              Doğru
            </button>
            <button
              type="button"
              disabled={phase === "reveal"}
              className={cn(
                "ls-tf-card ls-tf-card--no",
                picked === false && "is-selected",
                phase === "reveal" && !item.correct && "is-correct",
                phase === "reveal" && picked === false && item.correct && "is-wrong",
              )}
              onClick={() => choose(false)}
            >
              <X className="h-7 w-7" aria-hidden />
              Yanlış
            </button>
          </div>
          {phase === "reveal" ? (
            <>
              <p className="ls-explain">{item.explanation}</p>
              <div className="ls-actions">
                <button type="button" className="ls-cta" onClick={next}>
                  {index + 1 >= items.length ? "Sonucu gör" : "Sonraki iddia"}
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {phase === "results" ? (
        <StudioResults
          tool="tf"
          topic={topic}
          scoreLabel={`${score}/${items.length}`}
          title={score >= items.length - 1 ? "Keskin bakış." : "Tur kapandı."}
          lead={`${score} doğru. Yanlışları tekrar okuyup ikinci tura çık.`}
          onAgain={() => {
            setIndex(0);
            setPicked(null);
            setScore(0);
            setPhase("play");
          }}
          onNew={() => setPhase("entry")}
        />
      ) : null}

      <StudioPaywall
        open={paywall}
        onOpenChange={setPaywall}
        returnPath="/studio/dogru-yanlis"
      />
    </StudioFrame>
  );
}
