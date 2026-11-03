"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LevelCheckRunner, type LevelResult } from "@/components/level-check/level-check-runner";
import { httpLevelApi, type LevelApi, type LevelStartResponse, type MissingOutcome, type OfferOutcome } from "@/lib/level-check/types";
import "@/styles/level-check.css";

export const NO_EXTRA_TEXT = "Bu kazanım için ek soru hazır değil";
export const NO_EXTRA_LEFT_TEXT = "Şu an ek soru kalmadı; yeni sorular eklendikçe burada görünecek";
export const NEW_TEST_LABEL = "🔥 Bu Alt Konudan Yeni Pekiştirme Testi Aç";

/** Yeni pekiştirme testi başlatılamadığında öğrenciye giden dürüst metin. */
export function newTestNotice(status: string, limit?: number): string {
  if (status === "limit") return `Bugünlük yeni pekiştirme hakkın doldu (günde ${limit ?? 3}). Yarın yeniden açabilirsin.`;
  if (status === "locked") return "Ücretsiz hesapta yeni pekiştirme testi yalnız açık konunda açılır.";
  if (status === "paused") return "Yeni soru hazırlama şu an duraklatıldı; havuzdaki hazır sorularla çalışmaya devam edebilirsin.";
  if (status === "empty") return "Bu kazanım için doğrulamadan geçen yeni soru çıkmadı; biraz sonra yeniden dene.";
  return "Yeni sorular şu an hazırlanamadı; biraz sonra yeniden dene.";
}

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
  initialCode,
}: {
  /** Verilirse kutu doğrudan bu kazanımın yeni pekiştirme testiyle açılır (önce havuzdaki görülmemiş sorular). */
  initialCode?: string;
  prepId: string;
  unitId: string;
  unitTitle: string;
  api?: LevelApi;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "offer" | "run" | "result" | "empty" | "hidden">(initialCode ? "run" : "loading");
  const [newCode, setNewCode] = useState<string | null>(initialCode ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ list: OfferOutcome[]; total: number } | null>(null);

  // Öneri metni sunucunun gerçek sayımından (yanıtlanmamış, doğrulanmış soru) gelir; söz = teslim.
  useEffect(() => {
    if (initialCode) return;
    let live = true;
    api
      .start({ mode: "reinforce", unit: unitId, prepId, peek: true })
      .then((res) => {
        if (!live) return;
        if (res.status === "offer") {
          setOffer({ list: res.offer, total: res.total });
          setMissing(res.missing ?? []);
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
  }, [api, unitId, prepId, initialCode]);
  const [missing, setMissing] = useState<MissingOutcome[]>([]);
  const [weakCount, setWeakCount] = useState<number | null>(null);
  const [results, setResults] = useState<LevelResult[]>([]);

  /** Havuz soruları çözülürken arkada üretilen yeni sorular (fill). İlk tur bitince ikinci tur bundan açılır. */
  const fillRef = useRef<Promise<LevelStartResponse> | null>(null);
  const [round, setRound] = useState(0);
  const roundApi = useMemo<LevelApi>(() => {
    const pending = round > 0 ? fillRef.current : null;
    if (!pending) return api;
    let used = false;
    return {
      answer: api.answer,
      start: (req) => {
        if (used) return api.start(req);
        used = true;
        return pending;
      },
    };
  }, [api, round]);

  if (phase === "hidden") return null;

  const openNew = (code: string) => {
    setNotice(null);
    fillRef.current = null;
    setRound(0);
    setResults([]);
    setNewCode(code);
    setPhase("run");
  };
  const missingList = missing.length ? (
    <ul className="lc-results" data-testid="reinforce-missing">
      {missing.map((m) => (
        <li key={m.code}>
          <b>{m.code}</b>: {NO_EXTRA_TEXT}.
          <button type="button" className="lc-cta lc-cta--new" data-testid="reinforce-new" onClick={() => openNew(m.code)}>
            {NEW_TEST_LABEL}
          </button>
        </li>
      ))}
    </ul>
  ) : null;
  const noticeLine = notice ? (
    <p className="lc-status" role="status" data-testid="reinforce-new-notice">
      {notice}
    </p>
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
          api={roundApi}
          key={`${newCode ?? "reinforce"}:${round}`}
          request={newCode ? { mode: "reinforce_new", unit: unitId, prepId, code: newCode } : { mode: "reinforce", unit: unitId, prepId }}
          title={newCode ? `Yeni pekiştirme · ${newCode}` : "Pekiştirme"}
          onStarted={(res) => {
            if (newCode) {
              if (res.status === "ok" && res.more && !fillRef.current) {
                // Stream-first: ilk sorular hemen; hedefe (5) kalanları arkada üret (v14 → item_bank).
                fillRef.current = api.start({ mode: "reinforce_new", unit: unitId, prepId, code: newCode, fill: true }).catch(
                  () => ({ status: "unavailable" }) as LevelStartResponse,
                );
              }
              if (res.status !== "ok") {
                setNotice(newTestNotice(res.status, res.status === "limit" ? res.limit : undefined));
                setNewCode(null);
                setPhase(missing.length ? "empty" : results.length ? "result" : "empty");
              }
              return;
            }
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
            const all = [...results, ...r];
            setResults(all);
            if (newCode && fillRef.current && round === 0) {
              // İkinci tur: arkada üretilen yeni sorular (hazır değilse runner yükleniyor gösterir).
              setRound(1);
              return;
            }
            fillRef.current = null;
            setNewCode(null);
            setPhase("result");
          }}
        />
      ) : null}
      {phase === "empty" ? (
        <>
          <p className="lc-kicker">Pekiştirme</p>
          <p className="lc-status" data-testid="reinforce-empty">
            {initialCode ? (notice ? null : `${NO_EXTRA_LEFT_TEXT}.`) : weakCount === 0 ? "Bu ünitede zayıf kazanım görünmüyor; ek soru gerekmiyor." : `${NO_EXTRA_LEFT_TEXT}.`}
          </p>
          {missingList}
          {noticeLine}
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
          {noticeLine}
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
