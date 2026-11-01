"use client";

import { useState } from "react";
import { LevelCheckRunner, type LevelResult } from "@/components/level-check/level-check-runner";
import { httpLevelApi, type LevelApi, type MissingOutcome } from "@/lib/level-check/types";
import "@/styles/level-check.css";

export const NO_EXTRA_TEXT = "Bu kazanım için ek soru hazır değil";

/**
 * Ünite sonu pekiştirme (Plan PR 4): zayıf kazanımlara (≥1 yanıt, ustalık < %50) havuzdan en çok 2'şer ek soru.
 * Sorular yalnız doğrulanmış havuzdan; yanıtlar item_responses + outcome_mastery'ye yazılır. Soru yoksa dürüstçe söylenir.
 */
export function ReinforceBox({
  prepId,
  unitId,
  unitTitle,
  api = httpLevelApi,
  onDone,
}: {
  prepId: string;
  unitId: string;
  unitTitle: string;
  api?: LevelApi;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<"offer" | "run" | "result" | "empty" | "hidden">("offer");
  const [missing, setMissing] = useState<MissingOutcome[]>([]);
  const [weakCount, setWeakCount] = useState<number | null>(null);
  const [results, setResults] = useState<LevelResult[]>([]);

  if (phase === "hidden") return null;

  const missingList = missing.length ? (
    <ul className="lc-results" data-testid="reinforce-missing">
      {missing.map((m) => (
        <li key={m.code}>
          <b>{m.code}</b>: {NO_EXTRA_TEXT}.
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <section className="lc-box" aria-label="Pekiştirme" data-testid="reinforce">
      {phase === "offer" ? (
        <>
          <p className="lc-kicker">Pekiştirme · zayıf kazanımlar</p>
          <p className="lc-q">
            <b>{unitTitle}</b>: zorlandığın her kazanım için doğrulanmış havuzdan en çok 2 ek soru.
          </p>
          <div className="lc-actions">
            <button type="button" className="lc-cta" onClick={() => setPhase("run")}>
              Ek soruları çöz
            </button>
          </div>
        </>
      ) : null}
      {phase === "run" ? (
        <LevelCheckRunner
          api={api}
          request={{ mode: "reinforce", unit: unitId, prepId }}
          title="Pekiştirme"
          onStarted={(res) => {
            setMissing("missing" in res && res.missing ? res.missing : []);
            if (res.status === "empty") {
              setWeakCount(res.weakCount ?? null);
              setPhase("empty");
            }
          }}
          onSkip={() => setPhase("hidden")}
          onFinish={(r) => {
            setResults(r);
            setPhase("result");
          }}
        />
      ) : null}
      {phase === "empty" ? (
        <>
          <p className="lc-kicker">Pekiştirme</p>
          <p className="lc-status" data-testid="reinforce-empty">
            {weakCount === 0 ? "Bu ünitede zayıf kazanım görünmüyor; ek soru gerekmiyor." : `${NO_EXTRA_TEXT}.`}
          </p>
          {missingList}
          <button type="button" className="lc-skip" onClick={() => setPhase("hidden")}>Kapat</button>
        </>
      ) : null}
      {phase === "result" ? (
        <>
          <p className="lc-kicker">Pekiştirme · sonuç</p>
          <p className="lc-q" data-testid="reinforce-result">
            {results.length} ek sorudan {results.filter((r) => r.correct).length} doğru. Hakimiyet haritan bu yanıtlarla güncellenir.
          </p>
          {missingList}
          <button
            type="button"
            className="lc-skip"
            onClick={() => {
              setPhase("hidden");
              onDone?.();
            }}
          >
            Kapat
          </button>
        </>
      ) : null}
    </section>
  );
}
