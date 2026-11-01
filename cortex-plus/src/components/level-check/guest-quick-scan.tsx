"use client";

import { useState } from "react";
import { LevelCheckRunner } from "@/components/level-check/level-check-runner";
import { httpLevelApi, type LevelApi } from "@/lib/level-check/types";
import "@/styles/level-check.css";

export type GuestScanSubject = { key: string; label: string; unitIds: string[] };

/**
 * Misafir ön izlemesi: ⚡ Akıllı Hızlı Tarama'nın ilk 3 sorusu. Hiçbir yanıt kaydedilmez (sunucu misafirde yazmaz);
 * sonunda ücretsiz hesap çağrısı. Tam tarama (10–12 soru) kurulumda, hesapla.
 */
export function GuestQuickScan({
  subjects,
  initialKey,
  nextHref,
  api = httpLevelApi,
}: {
  subjects: GuestScanSubject[];
  initialKey: string | null;
  nextHref: string;
  api?: LevelApi;
}) {
  const [key, setKey] = useState<string | null>(subjects.some((s) => s.key === initialKey) ? initialKey : null);
  const subject = subjects.find((s) => s.key === key) ?? null;

  return (
    <main className="lc-page" data-testid="guest-scan">
      <p className="lc-kicker">Ücretsiz ön izleme · 3 soru</p>
      <h1 className="lc-title">⚡ Akıllı Hızlı Tarama</h1>
      {!subject ? (
        <>
          <p className="lc-status">Bir ders seç; o dersin en çok kazanım içeren ünitelerinden 3 hazır soru gelir.</p>
          <div className="lc-choices">
            {subjects.map((s) => (
              <button key={s.key} type="button" className="lc-choice" onClick={() => setKey(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <LevelCheckRunner
          key={subject.key}
          api={api}
          request={{ mode: "quick_scan", units: subject.unitIds }}
          title={`Hızlı Tarama · ${subject.label}`}
          guestNext={nextHref}
          onSkip={() => setKey(null)}
          onFinish={() => undefined}
        />
      )}
    </main>
  );
}
