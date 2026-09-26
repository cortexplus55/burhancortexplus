"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  postStudio,
  StudioEntry,
  StudioFrame,
  StudioLoading,
  StudioPaywall,
} from "@/components/learning/studio/studio-shared";
import { FlashcardSession } from "@/components/learning/flashcard-session";
import { makeCardKey, type FlashcardKind } from "@/lib/learning/flashcard-model";

type GeneratedCard = {
  id: string;
  front: string;
  back: string;
  kind?: FlashcardKind;
  sourceLabel?: string | null;
  cardKey?: string;
  cardSource?: "studio";
};

export function FlashcardStudio({
  creditCost,
  initialTopic = "",
  sourceDocument = null,
}: {
  creditCost: number | null;
  initialTopic?: string;
  sourceDocument?: { id: string; fileName: string } | null;
}) {
  const [phase, setPhase] = useState<"entry" | "loading" | "play">("entry");
  const [title, setTitle] = useState("");
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [grounded, setGrounded] = useState(true);
  const [paywall, setPaywall] = useState(false);

  async function start(topic: string) {
    setPhase("loading");
    const result = await postStudio<{
      title?: string;
      cards?: GeneratedCard[];
      grounded?: boolean;
      sourceNote?: string | null;
    }>("/api/learning/flashcards/generate", {
      topic,
      count: 10,
      ...(sourceDocument ? { documentId: sourceDocument.id } : {}),
    });
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("entry");
      return;
    }
    if (!result.ok || !result.data.cards?.length) {
      toast.error(
        !result.ok && result.error === "document_not_ready"
          ? "Belge henüz hazır değil ya da içi boş. Kredin düşmedi."
          : "Kartlar üretilemedi. Kredin düşmedi.",
      );
      setPhase("entry");
      return;
    }
    setTitle(result.data.title ?? topic);
    setGrounded(result.data.grounded !== false);
    if (result.data.sourceNote) toast.message(result.data.sourceNote);
    setCards(result.data.cards);
    setPhase("play");
  }

  return (
    <StudioFrame tool="flash" kicker="Flashcard stüdyosu">
      {phase === "entry" ? (
        <>
          {sourceDocument ? (
            <p className="ls-credit" style={{ marginBottom: "0.5rem" }}>
              Kaynak: {sourceDocument.fileName} — kartlar yalnızca bu belgeden.
            </p>
          ) : null}
          <StudioEntry
            tool="flash"
            title="Kartlar sahneye çıkar."
            placeholder={
              sourceDocument ? "Örn. 2. bölüm — hücre zarı" : "Örn. Türev kuralları"
            }
            submitLabel="Desteyi aç"
            creditCost={creditCost}
            initialTopic={initialTopic}
            onSubmit={(next) => void start(next)}
          />
        </>
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="Kartların hazırlanıyor…" lead="Kaynak kontrolü ve aralıklı tekrar." />
      ) : null}

      {phase === "play" && cards.length ? (
        <FlashcardSession
          title={title || "Kart destesi"}
          grounded={grounded}
          cards={cards.map((card) => ({
            id: card.id,
            front: card.front,
            back: card.back,
            kind: card.kind ?? "definition",
            cardKey: card.cardKey || makeCardKey("studio", card.id),
            cardSource: "studio",
            sourceLabel: card.sourceLabel ?? sourceDocument?.fileName ?? null,
          }))}
          newCount={cards.length}
          dueCount={0}
          mistakeCount={0}
          homeHref="/studio/flashcard"
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
