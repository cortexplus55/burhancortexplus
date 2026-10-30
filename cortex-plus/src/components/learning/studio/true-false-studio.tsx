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
import { useTrueFalseKeys } from "@/components/learning/true-false-focus-card";
import { trueFalseExplanation } from "@/lib/learning/true-false-quality";

type Item = { id: string; text: string; correct: boolean; explanation: string; correctedStatement?: string };

const ITEM_COUNTS = [
  { value: 8, label: "8 önerme" },
  { value: 12, label: "12 önerme" },
  { value: 16, label: "16 önerme" },
] as const;

export function TrueFalseStudio({
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
  const [count, setCount] = useState<number>(8);
  const [notice, setNotice] = useState<string | null>(null);
  const sourceDocument = sourceMode === "document" ? documents.find((doc) => doc.id === documentId) ?? null : null;
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "reveal" | "results">(
    "entry",
  );
  const [topic, setTopic] = useState(initialTopic);
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  /** Kaçırılan önermeler (30 Ekim 2026, canlı tur): sonuç yalnız sayı söylüyordu, hangisinin kaçtığını değil. */
  const [missed, setMissed] = useState<Item[]>([]);
  const [paywall, setPaywall] = useState(false);
  const isPlus = Boolean(useStudentShellAccount()?.isPremium);

  const item = items[index];

  async function start(topic: string) {
    if (sourceMode === "document" && !sourceDocument) {
      toast.error(documentId ? "Belgen hâlâ hazırlanıyor; biter bitmez başlatabilirsin." : "Önce bir belge seç ya da yükle.");
      return;
    }
    setPhase("loading");
    const result = await postStudio<{
      items?: Item[];
      source?: { kind?: string; wholeDocument?: boolean; matched?: boolean; fileName?: string | null };
    }>("/api/learning/true-false/generate", {
      topic,
      count,
      ...(sourceDocument ? { documentId: sourceDocument.id } : {}),
    });
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("entry");
      return;
    }
    if (!result.ok || !result.data.items?.length) {
      toast.error(result.ok ? "Yeniden dene." : result.error);
      setPhase("entry");
      return;
    }
    setTopic(topic);
    setNotice(sourceNotice(result.data.source));
    setItems(result.data.items);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setMissed([]);
    setPhase("play");
  }

  function choose(value: boolean) {
    if (phase !== "play" || !item) return;
    setPicked(value);
    const ok = value === item.correct;
    if (ok) setScore((n) => n + 1);
    else setMissed((list) => [...list, item]);
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

  // ← / D Doğru, → / Y Yanlış; cevaptan sonra Enter sonraki iddia (28 Ekim 2026).
  useTrueFalseKeys({ active: phase === "play" || phase === "reveal", revealed: phase === "reveal", onPick: choose, onNext: next });

  return (
    <StudioFrame tool="tf" kicker="Doğru / Yanlış">
      {phase === "entry" ? (
        <StudioEntry
          tool="tf"
          title="Doğru / Yanlış"
          placeholder={sourceDocument ? "Örn. Belgenin tamamı ya da bir bölüm" : "Örn. Fotosentez"}
          submitLabel="Turu başlat"
          creditCost={creditCost}
          initialTopic={initialTopic}
          suggestions={documentSuggestions(sourceDocument)}
          setup={
            <StudioSetup>
              <StudioSourcePicker
                idPrefix="tf"
                documents={documents}
                mode={sourceMode}
                onModeChange={setSourceMode}
                documentId={documentId}
                onDocumentChange={setDocumentId}
              />
              <StudioChoices label="Kaç önerme?" options={ITEM_COUNTS} value={count} onChange={setCount} />
            </StudioSetup>
          }
          onSubmit={(next) => void start(next)}
        />
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="Önermeler hazırlanıyor" lead={`${count} önerme; her biri ikinci kez denetleniyor.`} />
      ) : null}

      {(phase === "play" || phase === "reveal") && item ? (
        <>
          <StudioProgress index={index} total={items.length} />
          {notice && index === 0 ? <p className="ls-source-notice">{notice}</p> : null}
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
              {/* Yanlış önermede açıklama "✏️ Doğrusu: …" ile başlar. */}
              <p className="ls-explain">{trueFalseExplanation(item)}</p>
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
          lead={missed.length ? `${score} doğru. Kaçırdıklarını oku, sonra ikinci tura çık.` : `${score} doğru. Hepsini bildin.`}
          onAgain={() => {
            setIndex(0);
            setPicked(null);
            setScore(0);
            setMissed([]);
            setPhase("play");
          }}
          onNew={() => setPhase("entry")}
        >
          {missed.length ? (
            <ul className="ls-missed" aria-label="Kaçırdığın önermeler">
              {missed.map((entry, i) => (
                <li key={`${i}-${entry.text}`}>
                  <p className="ls-missed-claim">
                    <span>{entry.correct ? "Doğru" : "Yanlış"}</span> {entry.text}
                  </p>
                  <p className="ls-missed-why">{trueFalseExplanation(entry)}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </StudioResults>
      ) : null}

      <StudioPaywall
        open={paywall}
        onOpenChange={setPaywall}
        returnPath="/studio/dogru-yanlis"
      />
    </StudioFrame>
  );
}
