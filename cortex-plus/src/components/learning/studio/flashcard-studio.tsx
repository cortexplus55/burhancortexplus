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

type Card = { id: string; front: string; back: string };

const CARD_COUNTS = [
  { value: 10, label: "10 kart" },
  { value: 15, label: "15 kart" },
  { value: 20, label: "20 kart" },
  { value: 25, label: "25 kart" },
] as const;

export function FlashcardStudio({
  creditCost,
  initialTopic = "",
  documents = [],
  initialDocumentId = null,
}: {
  creditCost: number | null;
  initialTopic?: string;
  /** Hazır belgeler; seçilirse kartlar yalnızca o belgeden (19 Ekim 2026'dan beri burada seçilir). */
  documents?: StudioDocument[];
  initialDocumentId?: string | null;
}) {
  const [sourceMode, setSourceMode] = useState<StudioSourceMode>(initialDocumentId ? "document" : "topic");
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId ?? documents[0]?.id ?? null);
  const [count, setCount] = useState<number>(10);
  const [notice, setNotice] = useState<string | null>(null);
  const sourceDocument = sourceMode === "document" ? documents.find((doc) => doc.id === documentId) ?? null : null;
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "results">("entry");
  const [topic, setTopic] = useState(initialTopic);
  const [title, setTitle] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [again, setAgain] = useState(0);
  const [paywall, setPaywall] = useState(false);

  const card = cards[index];

  async function start(topic: string) {
    if (sourceMode === "document" && !sourceDocument) {
      toast.error(documentId ? "Belgen hâlâ hazırlanıyor; biter bitmez başlatabilirsin." : "Önce bir belge seç ya da yükle.");
      return;
    }
    setPhase("loading");
    const result = await postStudio<{
      title?: string;
      cards?: Card[];
      source?: { kind?: string; wholeDocument?: boolean; matched?: boolean; fileName?: string | null };
    }>("/api/learning/flashcards/generate", {
      topic,
      count,
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
          : "Kartlar bu sefer tamamlanamadı; iki kez denedik. Kredin düşmedi, yeniden dene.",
      );
      setPhase("entry");
      return;
    }
    setTopic(topic);
    setTitle(result.data.title ?? topic);
    setNotice(sourceNotice(result.data.source));
    setCards(result.data.cards);
    setIndex(0);
    setFlipped(false);
    setKnown(0);
    setAgain(0);
    setPhase("play");
  }

  function mark(knew: boolean) {
    if (knew) setKnown((n) => n + 1);
    else setAgain((n) => n + 1);
    if (index + 1 >= cards.length) {
      setPhase("results");
      return;
    }
    setIndex((n) => n + 1);
    setFlipped(false);
  }

  return (
    <StudioFrame tool="flash" kicker="Kartlar">
      {phase === "entry" ? (
        <StudioEntry
          tool="flash"
          title="Kartlar"
          placeholder={sourceDocument ? "Örn. Belgenin tamamı ya da bir bölüm" : "Örn. Türev kuralları"}
          submitLabel="Desteyi aç"
          creditCost={creditCost}
          initialTopic={initialTopic}
          suggestions={documentSuggestions(sourceDocument)}
          setup={
            <StudioSetup>
              <StudioSourcePicker
                idPrefix="flash"
                documents={documents}
                mode={sourceMode}
                onModeChange={setSourceMode}
                documentId={documentId}
                onDocumentChange={setDocumentId}
              />
              <StudioChoices label="Kaç kart?" options={CARD_COUNTS} value={count} onChange={setCount} />
            </StudioSetup>
          }
          onSubmit={(next) => void start(next)}
        />
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="Desten kuruluyor" lead={`${count} kart${sourceDocument ? " belgenden" : ""}; her biri ikinci kez denetleniyor.`} />
      ) : null}

      {phase === "play" && card ? (
        <>
          <StudioProgress index={index} total={cards.length} />
          <p className="ls-credit" style={{ marginBottom: "0.85rem" }}>
            {title}
          </p>
          {notice && index === 0 ? <p className="ls-source-notice">{notice}</p> : null}
          <button
            type="button"
            className="ls-flash-scene"
            onClick={() => setFlipped((v) => !v)}
            aria-expanded={flipped}
            aria-label={flipped ? "Kartı soruya çevir" : "Kartı cevaba çevir"}
          >
            <div className={cn("ls-flash-inner", flipped && "is-flipped")}>
              <div className="ls-flash-face">
                <span className="ls-flash-kicker">Soru</span>
                <p className="ls-flash-text break-words [overflow-wrap:anywhere]">
                  {card.front}
                </p>
                <span className="ls-credit">Çevirmek için dokun</span>
              </div>
              <div className="ls-flash-face ls-flash-face--back">
                <span className="ls-flash-kicker">Cevap</span>
                <p className="ls-flash-text break-words [overflow-wrap:anywhere]">
                  {card.back}
                </p>
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
          scoreLabel={`${index + 1} / ${cards.length}`}
          title="Deste kapandı."
          lead={`Öğrenildi: ${known} · Tekrar edilecek: ${again}`}
          onAgain={() => {
            setIndex(0);
            setFlipped(false);
            setKnown(0);
            setAgain(0);
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
