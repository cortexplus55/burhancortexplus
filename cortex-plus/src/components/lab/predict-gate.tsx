"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tahmin kapısı.
 *
 * Öğrenci sonucu görmeden önce tahmin ediyor. Sebebi pedagojik: tahmin
 * etmeden bakılan sonuç "tabii ki öyle" diye okunur ve hiçbir şey öğretmez;
 * tahmin edip yanılmak ise yanlış modeli görünür kılar.
 *
 * Kapı zorlayıcı değil — "tahmin etmeden geç" her zaman açık. Zorlamak
 * öğrenciyi rastgele sayı yazmaya iter, bu da tahmini anlamsızlaştırır.
 */

type Phase = "asking" | "revealed" | "skipped";

export function PredictGate({
  question,
  hint,
  actual,
  unit,
  format,
  /** Bu orana kadar sapma "tutturdun" sayılır. */
  tolerance = 0.15,
  onDone,
}: {
  question: string;
  hint?: string;
  actual: number;
  unit?: string;
  format?: (v: number) => string;
  tolerance?: number;
  /** Kapı kapandı — sahne artık serbest. */
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [guess, setGuess] = useState("");
  const [locked, setLocked] = useState<number | null>(null);

  // Soru değişirse kapı yeniden kurulur.
  useEffect(() => {
    setPhase("asking");
    setGuess("");
    setLocked(null);
  }, [question]);

  const show = (v: number) =>
    format ? format(v) : String(Math.round(v * 100) / 100);

  if (phase === "skipped") return null;

  if (phase === "revealed" && locked !== null) {
    const off = Math.abs(locked - actual);
    // Gerçek değer sıfıra yakınsa oransal sapma anlamsızlaşır; o durumda
    // mutlak farka düşüyoruz ki "%900 saptın" gibi bir geri bildirim çıkmasın.
    const scale = Math.max(Math.abs(actual), 1e-9);
    const close = off / scale <= tolerance;

    return (
      <div className={cn("pg", close ? "pg--good" : "pg--off")}>
        <p className="pg-verdict">
          {close ? "İyi tahmin." : "Beklediğinden farklı."}
        </p>
        <p className="pg-numbers">
          Tahminin{" "}
          <strong>
            {show(locked)}
            {unit}
          </strong>{" "}
          · Gerçek{" "}
          <strong>
            {show(actual)}
            {unit}
          </strong>
        </p>
        <p className="pg-note">
          Şimdi denetimleri oynat; hangi değişkenin sonucu ne kadar
          değiştirdiğini gör.
        </p>
        <button
          type="button"
          className="pg-skip"
          onClick={() => {
            setPhase("skipped");
            onDone?.();
          }}
        >
          Kapat
        </button>
      </div>
    );
  }

  return (
    <form
      className="pg"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(guess.replace(",", "."));
        if (!Number.isFinite(n)) return;
        setLocked(n);
        setPhase("revealed");
      }}
    >
      <p className="pg-kicker">Önce tahmin et</p>
      <p className="pg-question">{question}</p>
      {hint ? <p className="pg-hint">{hint}</p> : null}
      <div className="pg-row">
        <input
          type="text"
          inputMode="decimal"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Tahminin"
          aria-label="Tahminin"
        />
        {unit ? <span className="pg-unit">{unit}</span> : null}
        <button type="submit" disabled={!guess.trim()}>
          Gör
        </button>
      </div>
      <button
        type="button"
        className="pg-skip"
        onClick={() => {
          setPhase("skipped");
          onDone?.();
        }}
      >
        Tahmin etmeden geç
      </button>
    </form>
  );
}
