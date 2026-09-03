"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDuration, type PuzzleId } from "@/lib/parity/daily-puzzles";

/**
 * Bulmaca kabuğu: zamanlayıcı, çözüm gönderimi, liderlik tablosu.
 *
 * Ekranda dönen süre yalnızca gösterge. Kaydedilen süreyi sunucu ölçüyor
 * (açılışta imzalı jeton, bitişte fark) — tarayıcıya sorulsaydı tablo
 * uydurulmuş sürelerle dolardı.
 */

type BoardEntry = {
  rank: number;
  display_name: string;
  duration_ms: number;
  is_me: boolean;
};

type Result = { durationMs: number; bestMs: number; improved: boolean };

export function PuzzleShell({
  puzzleId,
  title,
  blurb,
  children,
}: {
  puzzleId: PuzzleId;
  title: string;
  blurb: string;
  /** Bulmaca, çözüldüğünde `onSolved` çağırır. */
  children: (api: { onSolved: (moves?: number) => void }) => React.ReactNode;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [board, setBoard] = useState<BoardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number>(Date.now());
  const submitting = useRef(false);

  // Açılışta jeton al. Alınamazsa bulmaca yine oynanır, sadece kaydedilmez.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/lab/puzzle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", puzzleId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.token) return;
        setToken(data.token);
        startedAt.current = Date.now();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  // Gösterge sayacı; çözülünce durur.
  useEffect(() => {
    if (result) return;
    const id = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
    }, 100);
    return () => window.clearInterval(id);
  }, [result]);

  const loadBoard = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/lab/puzzle?puzzleId=${encodeURIComponent(puzzleId)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setBoard(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      /* tablo ikincil; sessizce geç */
    }
  }, [puzzleId]);

  const onSolved = useCallback(
    async (moves?: number) => {
      // İki kez gönderilmesin: bazı bulmacalar her hamlede kontrol ediyor.
      if (submitting.current || result) return;
      submitting.current = true;

      if (!token) {
        setError("Süren kaydedilemedi — oturum başlatılamamıştı.");
        setResult({ durationMs: Date.now() - startedAt.current, bestMs: 0, improved: false });
        void loadBoard();
        return;
      }

      try {
        const res = await fetch("/api/lab/puzzle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finish", puzzleId, token, moves }),
        });
        if (!res.ok) {
          setError("Süren kaydedilemedi.");
          setResult({ durationMs: Date.now() - startedAt.current, bestMs: 0, improved: false });
        } else {
          setResult(await res.json());
        }
      } catch {
        setError("Bağlantı kurulamadı, süren kaydedilemedi.");
        setResult({ durationMs: Date.now() - startedAt.current, bestMs: 0, improved: false });
      }
      void loadBoard();
    },
    [loadBoard, puzzleId, result, token],
  );

  return (
    <div className="ap-pz">
      <div className="ap-pz-head">
        <div>
          <h1 className="ap-pz-title">{title}</h1>
          <p className="ap-pz-blurb">{blurb}</p>
        </div>
        <div className="ap-pz-timer" aria-live="off">
          {formatDuration(result ? result.durationMs : elapsed)}
        </div>
      </div>

      <div className="ap-pz-stage">{children({ onSolved })}</div>

      {result ? (
        <div className="ap-pz-result" role="status">
          <p className="ap-pz-done">
            Çözdün — {formatDuration(result.durationMs)}
          </p>
          {error ? (
            <p className="ap-pz-error">{error}</p>
          ) : result.improved ? (
            <p className="ap-pz-note">Bugünkü en iyi süren bu.</p>
          ) : (
            <p className="ap-pz-note">
              Bugünkü en iyin hâlâ {formatDuration(result.bestMs)}.
            </p>
          )}
        </div>
      ) : null}

      <section className="ap-pz-board">
        <h2>Liderlik tablosu</h2>
        {board === null ? (
          <p className="ap-pz-empty">
            Bulmacayı çözünce bugünün sıralaması burada görünecek.
          </p>
        ) : board.length === 0 ? (
          <p className="ap-pz-empty">
            Bugün bunu henüz kimse çözmedi. İlk çözen sen ol — süren burada
            görünecek.
          </p>
        ) : (
          <ol className="ap-pz-list">
            {board.map((entry) => (
              <li
                key={`${entry.rank}-${entry.display_name}`}
                className={entry.is_me ? "is-me" : undefined}
              >
                <span className="ap-pz-rank">{entry.rank}</span>
                <span className="ap-pz-name">
                  {entry.display_name}
                  {entry.is_me ? " (sen)" : ""}
                </span>
                <span className="ap-pz-time">
                  {formatDuration(entry.duration_ms)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Link href="/uygulamalar" className="ap-pz-back">
        ← Uygulamalara dön
      </Link>
    </div>
  );
}
