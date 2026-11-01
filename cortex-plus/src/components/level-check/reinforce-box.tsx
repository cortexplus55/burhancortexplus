"use client";

import { useEffect, useState } from "react";
import { LevelCheckRunner, type LevelResult } from "@/components/level-check/level-check-runner";
import { httpLevelApi, type LevelApi, type MissingOutcome, type OfferOutcome } from "@/lib/level-check/types";
import "@/styles/level-check.css";

export const NO_EXTRA_TEXT = "Bu kazanım için ek soru hazır değil";
export const NO_EXTRA_LEFT_TEXT = "Şu an ek soru kalmadı; yeni sorular eklendikçe burada görünecek";

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
  const [phase, setPhase] = useState<"loading" | "offer" | "run" | "result" | "empty" | "hidden">("loading");
  const [offer, setOffer] = useState<{ list: OfferOutcome[]; total: number } | null>(null);

  // Öneri metni sunucunun gerçek sayımından (yanıtlanmamış, doğrulanmış soru) gelir; söz = teslim.
  useEffect(() => {
    let live = true;
    api
      .start({ mode: "reinforce", unit: unitId, prepId, peek: true })
      .then((res) => {
        if (!live) return;
        if (res.status === "offer") {
          setOffer({ list: res.offer, total: res.total });
          setWeakCount(res.weakCount);
          setPhase(res.total > 0 ? "offer" : "empty");
        } else {
          setWeakCount(res.status === "empty" ? (res.weakCount ?? null) : null);
          setPhase("empty");
        }
      })
      .catch(() => live && setPhase("empty"));
    return () => {
      live = false;
    };
  }, [api, unitId, prepId]);
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
      {phase === "loading" ? <p className="lc-status">Pekiştirme soruları kontrol ediliyor…</p> : null}
      {phase === "offer" && offer ? (
        <>
          <p className="lc-kicker">Pekiştirme · zayıf kazanımlar</p>
          <p className="lc-q" data-testid="reinforce-offer">
            <b>{unitTitle}</b>: zorlandığın {offer.list.length} kazanım için doğrulanmış havuzdan {offer.total} ek soru.
          </p>
          <ul className="lc-results" data-testid="reinforce-offer-list">
            {offer.list.map((o) => (
              <li key={o.code}>
                <b>{o.code}</b>: {o.count} soru
              </li>
            ))}
          </ul>
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
          onSkip={() => {
            setPhase("hidden");
            onDone?.();
          }}
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
            {weakCount === 0 ? "Bu ünitede zayıf kazanım görünmüyor; ek soru gerekmiyor." : `${NO_EXTRA_LEFT_TEXT}.`}
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
