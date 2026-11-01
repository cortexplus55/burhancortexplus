"use client";

import { useEffect, useState } from "react";
import { LevelCheckRunner, type LevelResult } from "@/components/level-check/level-check-runner";
import { foldResponses, masteryLabel } from "@/lib/level-check/mastery";
import { httpLevelApi, type LevelApi } from "@/lib/level-check/types";
import "@/styles/level-check.css";

type OutcomeLine = { code: string; text: string; right: number; total: number; label: string };

function outcomeLines(results: LevelResult[]): OutcomeLine[] {
  const by = new Map<string, LevelResult[]>();
  for (const r of results) by.set(r.item.outcomeId, [...(by.get(r.item.outcomeId) ?? []), r]);
  return [...by.values()].map((list) => {
    const state = foldResponses(list.map((r) => ({ correct: r.correct, difficulty: r.item.difficulty })));
    const label = masteryLabel(state);
    return {
      code: list[0]!.item.outcomeCode,
      text: list[0]!.item.outcomeText,
      right: list.filter((r) => r.correct).length,
      total: list.length,
      label: label.kind === "no_data" ? label.text : `${label.text}, ustalık ≈ %${Math.round(label.mastery * 100)}`,
    };
  });
}

/**
 * Ünite Seviye Kontrolü (Plan PR 3, Aşama 2): öğrenci yolda bir üniteye başlarken havuzdan 3–4 doğrulanmış soru.
 * Yalnız sunucu ünitede en az 3 soru gördüğünde ve bu hazırlıkta daha önce yapılmadıysa gösterilir. Atlanabilir.
 */
export function UnitLevelCheck({
  prepId,
  unitId,
  unitTitle,
  api = httpLevelApi,
}: {
  prepId: string;
  unitId: string;
  unitTitle: string;
  api?: LevelApi;
}) {
  const skipKey = `cp-unit-check-skip:${prepId}:${unitId}`;
  const [phase, setPhase] = useState<"offer" | "run" | "result" | "hidden" | "empty">("offer");
  const [lines, setLines] = useState<OutcomeLine[]>([]);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(skipKey)) setPhase("hidden");
    } catch {
      /* depolama yok: öneri görünür kalır */
    }
  }, [skipKey]);

  function skip() {
    try {
      window.localStorage.setItem(skipKey, "1");
    } catch {
      /* yok say */
    }
    setPhase("hidden");
  }

  if (phase === "hidden") return null;

  return (
    <section className="lc-box" aria-label="Ünite Seviye Kontrolü" data-testid="unit-check">
      {phase === "offer" ? (
        <>
          <p className="lc-kicker">Ünite Seviye Kontrolü · 3–4 soru</p>
          <p className="lc-q">
            <b>{unitTitle}</b> ünitesine başlamadan önce kısa bir kontrol: hangi kazanımı bildiğini görelim.
          </p>
          <div className="lc-actions">
            <button type="button" className="lc-cta" onClick={() => setPhase("run")}>
              Kontrolü başlat
            </button>
            <button type="button" className="lc-skip" onClick={skip}>
              Atla
            </button>
          </div>
        </>
      ) : null}
      {phase === "run" ? (
        <LevelCheckRunner
          api={api}
          request={{ mode: "unit_check", unit: unitId, prepId }}
          title="Ünite Seviye Kontrolü"
          onSkip={skip}
          onEmpty={() => setPhase("hidden")}
          onFinish={(results, meta) => {
            setLines(outcomeLines(results));
            setSaved(meta.persisted);
            setPhase("result");
          }}
        />
      ) : null}
      {phase === "result" ? (
        <>
          <p className="lc-kicker">Ünite Seviye Kontrolü · sonuç</p>
          <ul className="lc-results" data-testid="unit-check-result">
            {lines.map((l) => (
              <li key={l.code}>
                <b>{l.code}</b> {l.text ? `${l.text.slice(0, 90)}${l.text.length > 90 ? "…" : ""}` : ""}: {l.total} sorudan {l.right} doğru ({l.label})
              </li>
            ))}
          </ul>
          <p className="lc-status">
            Kazanım başına 1–2 soru olduğu için bu sonuçlar tahmini; çalıştıkça netleşir.
            {saved ? "" : " Sonuç bu sefer kaydedilemedi."}
          </p>
          <button type="button" className="lc-skip" onClick={() => setPhase("hidden")}>
            Kapat
          </button>
        </>
      ) : null}
    </section>
  );
}
