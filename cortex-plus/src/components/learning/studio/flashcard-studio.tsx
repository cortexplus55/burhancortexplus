"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";

type Card = { id: string; front: string; back: string };

export function FlashcardStudio({
  creditCost,
  initialTopic = "",
}: {
  creditCost: number | null;
  initialTopic?: string;
}) {
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "results">("entry");
  const [topic, setTopic] = useState(initialTopic);
  const [title, setTitle] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [paywall, setPaywall] = useState(false);

  const card = cards[index];

  async function start(topic: string) {
    setPhase("loading");
    const result = await postStudio<{
      title?: string;
      cards?: Card[];
    }>("/api/learning/flashcards/generate", { topic, count: 10 });
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("entry");
      return;
    }
    if (!result.ok || !result.data.cards?.length) {
      toast.error(result.ok ? "Kartlar üretilemedi." : result.error);
      setPhase("entry");
      return;
    }
    setTopic(topic);
    setTitle(result.data.title ?? topic);
    setCards(result.data.cards);
    setIndex(0);
    setFlipped(false);
    setKnown(0);
    setPhase("play");
  }

  function mark(knew: boolean) {
    if (knew) setKnown((n) => n + 1);
    if (index + 1 >= cards.length) {
      setPhase("results");
      return;
    }
    setIndex((n) => n + 1);
    setFlipped(false);
  }

  return (
    <StudioFrame tool="flash" kicker="Flashcard stüdyosu">
      {phase === "entry" ? (
        <StudioEntry
          tool="flash"
          title="Kartlar sahneye çıkar."
          lead="Ön yüz kavram, arka yüz net açıklama. Dokun, çevir, sahiplen."
          placeholder="Örn. Türev kuralları"
          submitLabel="Desteyi aç"
          creditCost={creditCost}
          loading={false}
          initialTopic={initialTopic}
          onSubmit={(next) => void start(next)}
        />
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="Desten kuruluyor" lead="On kart, tek ışık, temiz tekrar." />
      ) : null}

      {phase === "play" && card ? (
        <>
          <StudioProgress index={index} total={cards.length} />
          <p className="ls-credit" style={{ marginBottom: "0.85rem" }}>
            {title}
          </p>
          <button
            type="button"
            className="ls-flash-scene"
            onClick={() => setFlipped((v) => !v)}
            aria-expanded={flipped}
          >
            <div className={cn("ls-flash-inner", flipped && "is-flipped")}>
              <div className="ls-flash-face">
                <span className="ls-flash-kicker">Soru</span>
                <p className="ls-flash-text">{card.front}</p>
                <span className="ls-credit">Çevirmek için dokun</span>
              </div>
              <div className="ls-flash-face ls-flash-face--back">
                <span className="ls-flash-kicker">Cevap</span>
                <p className="ls-flash-text">{card.back}</p>
                <span className="ls-credit">Kartı değerlendirebilirsin</span>
              </div>
            </div>
          </button>
          <div className="ls-actions">
            <button type="button" className="ls-ghost" onClick={() => mark(false)}>
              Tekrar
            </button>
            <button type="button" className="ls-cta" onClick={() => mark(true)}>
              Biliyorum
            </button>
          </div>
        </>
      ) : null}

      {phase === "results" ? (
        <StudioResults
          tool="flash"
          topic={topic}
          scoreLabel={`${known}/${cards.length}`}
          title="Deste kapandı."
          lead={`${known} kartı sahiplendin. Diğerlerini bir tur daha çevir.`}
          onAgain={() => {
            setIndex(0);
            setFlipped(false);
            setKnown(0);
            setPhase("play");
          }}
          onNew={() => setPhase("entry")}
        />
      ) : null}

      <StudioPaywall
        open={paywall}
        onOpenChange={setPaywall}
        returnPath="/studio/flashcard"
      />
    </StudioFrame>
  );
}
