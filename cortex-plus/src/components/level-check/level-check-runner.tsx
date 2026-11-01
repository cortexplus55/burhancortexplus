"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LevelApi, LevelItem, LevelStartRequest, LevelStartResponse } from "@/lib/level-check/types";
import "@/styles/level-check.css";

export type LevelResult = { item: LevelItem; correct: boolean };

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Seviye kontrolü çalıştırıcı (Hızlı Tarama ve Ünite Seviye Kontrolü ortak). Sorular havuzdan gelir; notlama
 * sunucuda; doğru şık yalnız yanıttan sonra gösterilir. Her an "Atla" ile çıkılır.
 */
export function LevelCheckRunner({
  api,
  request,
  title,
  onFinish,
  onSkip,
  onEmpty,
  guestNext,
}: {
  api: LevelApi;
  request: LevelStartRequest;
  title: string;
  onFinish: (results: LevelResult[], meta: { persisted: boolean; guest: boolean }) => void;
  onSkip: () => void;
  onEmpty?: (status: "empty" | "done") => void;
  /** Misafir ön izlemesi bitince kayıt sonrası dönülecek adres. */
  guestNext?: string;
}) {
  const [session, setSession] = useState<Extract<LevelStartResponse, { status: "ok" }> | null>(null);
  const [state, setState] = useState<"loading" | "error" | "empty" | "run" | "guest_end">("loading");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [graded, setGraded] = useState<{ correct: boolean; answer: number; explanation: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const results = useRef<LevelResult[]>([]);
  const shownAt = useRef(0);
  const persisted = useRef(true);

  useEffect(() => {
    let live = true;
    api
      .start(request)
      .then((res) => {
        if (!live) return;
        if (res.status !== "ok") {
          setState("empty");
          onEmpty?.(res.status);
          return;
        }
        setSession(res);
        persisted.current = res.persisted;
        shownAt.current = Date.now();
        setState("run");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
    // Başlatma bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading") return <p className="lc-status" role="status">Sorular havuzdan alınıyor…</p>;
  if (state === "error")
    return (
      <div className="lc-box">
        <p className="lc-status">Sorular şu an alınamadı.</p>
        <button type="button" className="lc-skip" onClick={onSkip}>Taramayı atla</button>
      </div>
    );
  if (state === "empty")
    return (
      <div className="lc-box" data-testid="level-empty">
        <p className="lc-status">Bu ders için hazır soru henüz yok.</p>
        <button type="button" className="lc-skip" onClick={onSkip}>Devam et</button>
      </div>
    );
  if (!session) return null;

  if (state === "guest_end")
    return (
      <div className="lc-box" data-testid="guest-signup">
        <p className="lc-kicker">{title}</p>
        <p className="lc-q">İlk {session.items.length} soruyu çözdün: {results.current.filter((r) => r.correct).length} doğru.</p>
        <p className="lc-status">
          Taramanın kalanı ve konu konu sonucun için ücretsiz hesap aç. Ön izleme yanıtların hiçbir yere kaydedilmedi.
        </p>
        <Link className="lc-cta" href={`/kayit${guestNext ? `?next=${encodeURIComponent(guestNext)}` : ""}`}>
          Ücretsiz hesap aç
        </Link>
      </div>
    );

  const item = session.items[index]!;
  const total = session.items.length;

  async function choose(choice: number) {
    if (busy || graded || !session) return;
    setBusy(true);
    setPicked(choice);
    try {
      const res = await api.answer({ token: session.token, itemId: item.id, choice, timeMs: Date.now() - shownAt.current });
      if (!res.persisted) persisted.current = false;
      results.current.push({ item, correct: res.correct });
      setGraded(res);
    } catch {
      setPicked(null);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!session) return;
    if (index + 1 >= total) {
      if (session.guest) {
        setState("guest_end");
        return;
      }
      onFinish(results.current, { persisted: persisted.current, guest: session.guest });
      return;
    }
    setIndex(index + 1);
    setPicked(null);
    setGraded(null);
    shownAt.current = Date.now();
  }

  return (
    <div className="lc-box" data-testid="level-runner">
      <div className="lc-head">
        <p className="lc-kicker">
          {title} · {index + 1} / {total}
        </p>
        <button type="button" className="lc-skip" onClick={onSkip}>
          Atla
        </button>
      </div>
      <p className="lc-unit">{item.unitTitle}</p>
      <p className="lc-q" data-testid="level-question">{item.stem}</p>
      <ul className="lc-choices">
        {item.choices.map((c, i) => {
          const tone = graded ? (i === graded.answer ? "right" : i === picked ? "wrong" : undefined) : i === picked ? "picked" : undefined;
          return (
            <li key={i}>
              <button type="button" className="lc-choice" data-tone={tone} disabled={busy || Boolean(graded)} onClick={() => choose(i)}>
                <b>{LETTERS[i] ?? i + 1})</b> <span>{c}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {graded ? (
        <div className="lc-feedback" data-testid="level-feedback">
          <p>
            <strong>{graded.correct ? "Doğru" : `Yanlış · doğru cevap ${LETTERS[graded.answer] ?? graded.answer + 1}`}</strong>
          </p>
          {graded.explanation ? <p className="lc-status">{graded.explanation}</p> : null}
          <button type="button" className="lc-cta" onClick={next}>
            {index + 1 >= total ? (session.guest ? "Devam" : "Sonucu gör") : "Sonraki soru"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
