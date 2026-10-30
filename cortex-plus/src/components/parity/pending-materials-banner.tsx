"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postDocumentProcess, requestDocumentProcessing } from "@/lib/documents/process-session";
import { messageFromProcessBody } from "@/lib/documents/process-user-message";
import { attachedLine, mapAndAttach } from "@/lib/documents/prep-attach-client";
import { runPool } from "@/lib/documents/upload-batch";
import { useScreenAwake } from "@/lib/documents/use-universal-upload";
import {
  PENDING_DONE_TITLE,
  PENDING_MAPPING_LINE,
  PENDING_STALLED_LINE,
  PENDING_TITLE,
  pendingFailedLine,
  pendingProgress,
  pendingReadingLine,
} from "@/lib/learning/pending-materials-copy";
import "@/styles/pending-materials.css";

type Pending = {
  documentId: string;
  fileName: string;
  status: string;
  error: string | null;
  pagesDone: number | null;
  pageCount: number | null;
};

/** Sunucu ilerlemesi bu aralıkla okunur (başka sekme ya da önceki istek okuyorsa da sayaç ilerlesin). */
const POLL_MS = 4_000;
/** Aynı anda okutulan bekleyen belge. */
const READ_LANES = 3;
/** Bir sekme sürüyorsa öbürü yalnız izler; sekme kapanırsa kilit bu sürede düşer. */
const LOCK_MS = 3 * 60_000;

function lockKey(prepId: string) {
  return `cp:pending-drive:${prepId}`;
}

function takeLock(prepId: string, owner: string): boolean {
  try {
    const raw = window.localStorage.getItem(lockKey(prepId));
    const held = raw ? (JSON.parse(raw) as { owner?: string; at?: number }) : null;
    if (held && held.owner !== owner && typeof held.at === "number" && Date.now() - held.at < LOCK_MS) return false;
    window.localStorage.setItem(lockKey(prepId), JSON.stringify({ owner, at: Date.now() }));
    return true;
  } catch {
    return true;
  }
}

function dropLock(prepId: string, owner: string) {
  try {
    const raw = window.localStorage.getItem(lockKey(prepId));
    const held = raw ? (JSON.parse(raw) as { owner?: string }) : null;
    if (!held || held.owner === owner) window.localStorage.removeItem(lockKey(prepId));
  } catch {
    // Kilit yalnız aynı tarayıcıda çift ekleme olmasın diye; okunamazsa sekme yine sürer.
  }
}

/**
 * Hızlı başlatmanın hazırlık sayfasındaki şeridi (31 Ekim 2026, ürün sahibi: "kullanıcı beklemesin; kalan sayfalar
 * arkada işlensin"). Kurulum hazır olan materyalle kuruldu; okunmakta olan belgeler hazırlığa bekleyen olarak bağlı.
 * Şerit onları okutur (sekme kapanmışsa kaldığı yerden), sonra hazırlığın konu adlarıyla tek harita çıkarıp yoluna
 * ekler ("materyal ekle" ile aynı yol). Bekleyen belge yoksa hiçbir şey çizmez.
 */
export function PendingMaterialsBanner({ prepId }: { prepId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Pending[]>([]);
  const [phase, setPhase] = useState<"idle" | "reading" | "mapping" | "done" | "failed">("idle");
  const [line, setLine] = useState<string | null>(null);
  const [failedNames, setFailedNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const local = useRef(new Map<string, { done: number; total: number }>());
  const driving = useRef(false);
  const owner = useRef(`tab-${Math.random().toString(36).slice(2)}`);
  const alive = useRef(true);
  // Kalan sayfalar okunurken ekran kararmasın (31 Ekim 2026).
  useScreenAwake(phase === "reading" || phase === "mapping");

  const load = useCallback(async (): Promise<Pending[]> => {
    try {
      const res = await fetch(`/api/learning/exam-prep/pending-materials?prepId=${prepId}`, { cache: "no-store" });
      if (!res.ok) return [];
      const payload = (await res.json().catch(() => ({}))) as { materials?: Pending[] };
      return Array.isArray(payload.materials) ? payload.materials : [];
    } catch {
      return [];
    }
  }, [prepId]);

  const drive = useCallback(async (list: Pending[]) => {
    if (driving.current || !list.length) return;
    if (!takeLock(prepId, owner.current)) return;
    driving.current = true;
    setPhase("reading");
    setFailedNames([]);
    try {
      const ready: string[] = [];
      const failed: string[] = [];
      let stalled = 0;
      /** Hak dolduysa (402) "okunamadı" yanlış olur: sunucunun cümlesi söylenir. */
      let refusal: string | null = null;
      await runPool(list, READ_LANES, async (item) => {
        const result = await requestDocumentProcessing({
          documentId: item.documentId,
          post: (body) => postDocumentProcess({ ...body, prepId, deferMap: true }),
          onProgress: (progress) => {
            takeLock(prepId, owner.current);
            const total = Number(progress.pageCount);
            const next = Number(progress.nextPage ?? (Number(progress.pagesDone) + 1));
            if (Number.isFinite(total) && total > 0 && Number.isFinite(next)) {
              local.current.set(item.documentId, { done: Math.max(0, next - 1), total });
              if (alive.current) setItems((current) => [...current]);
            }
          },
        });
        if (result.ok) {
          ready.push(item.documentId);
          const known = local.current.get(item.documentId);
          if (known) local.current.set(item.documentId, { done: known.total, total: known.total });
        } else {
          // Ağ ya da zaman aşımı: kayıt kalır, sayfa yeniden açılınca sürer; okunamayan belge öğrenciye söylenir.
          const transient = result.status === 0 || result.status >= 500;
          if (transient) stalled += 1;
          else if (result.status === 402) refusal = refusal ?? messageFromProcessBody(result.body);
          else failed.push(item.fileName);
        }
        return true;
      });
      if (!alive.current) return;
      const order = list.map((item) => item.documentId).filter((id) => ready.includes(id));
      if (order.length) {
        setPhase("mapping");
        setLine(PENDING_MAPPING_LINE);
        const outcome = await mapAndAttach({ prepId, documentIds: order, onProgress: (progress) => alive.current && setLine(progress) });
        if (!alive.current) return;
        if (!outcome.ok) {
          setPhase("failed");
          setLine(outcome.error);
          return;
        }
        setLine(refusal ? `${attachedLine(outcome)} ${refusal}` : attachedLine(outcome));
        setPhase(failed.length ? "failed" : "done");
        setFailedNames(failed);
        router.refresh();
        setItems(await load());
        return;
      }
      if (failed.length || stalled || refusal) {
        setFailedNames(failed);
        setPhase("failed");
        setLine(refusal ?? (stalled ? PENDING_STALLED_LINE : null));
      } else {
        setPhase("idle");
      }
    } finally {
      driving.current = false;
      dropLock(prepId, owner.current);
    }
  }, [load, prepId, router]);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    void load().then((list) => {
      if (!alive.current) return;
      setItems(list);
      if (!list.length) return;
      void drive(list);
      // Sayaç sunucudan da okunur: başka sekme ya da önceki istek okuyorsa ilerleme yine görünür.
      timer = setInterval(() => {
        void load().then((fresh) => {
          if (!alive.current) return;
          setItems((before) => {
            // Başka sekme ekledi: yeni konular görünsün.
            if (before.length && !fresh.length && !driving.current) router.refresh();
            return fresh;
          });
          if (!fresh.length && timer) {
            clearInterval(timer);
            timer = null;
          }
        });
      }, POLL_MS);
    });
    return () => {
      alive.current = false;
      if (timer) clearInterval(timer);
    };
  }, [drive, load, router]);

  async function dismiss() {
    setBusy(true);
    try {
      const list = items.filter((item) => failedNames.includes(item.fileName));
      for (const item of list) {
        await fetch("/api/learning/exam-prep/pending-materials", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prepId, documentId: item.documentId }),
        }).catch(() => undefined);
      }
      setFailedNames([]);
      setItems(await load());
      setPhase((current) => (current === "failed" ? "idle" : current));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "done") {
    return (
      <section className="cp-pending-materials cp-pending-materials--done" role="status" aria-live="polite">
        <p className="cp-pending-materials-title">{PENDING_DONE_TITLE}</p>
        {line ? <p className="cp-pending-materials-line">{line}</p> : null}
      </section>
    );
  }
  if (!items.length && phase !== "failed" && phase !== "mapping") return null;

  const merged = items.map((item) => {
    const mine = local.current.get(item.documentId);
    return {
      pagesDone: Math.max(item.pagesDone ?? 0, mine?.done ?? 0),
      pageCount: item.pageCount ?? mine?.total ?? null,
    };
  });
  const { done, total } = pendingProgress(merged);
  const percent = total > 0 ? Math.round((done / total) * 100) : 8;

  return (
    <section
      className={`cp-pending-materials${phase === "failed" ? " cp-pending-materials--failed" : ""}`}
      role="status"
      aria-live="polite"
    >
      <p className="cp-pending-materials-title">{PENDING_TITLE}</p>
      <p className="cp-pending-materials-line">
        {phase === "mapping" || (phase === "failed" && line) ? line : pendingReadingLine(done, total)}
      </p>
      {phase !== "failed" ? (
        <div className="cp-pending-materials-bar" aria-hidden>
          <span style={{ width: `${phase === "mapping" ? 100 : Math.max(4, percent)}%` }} />
        </div>
      ) : null}
      {failedNames.length ? <p className="cp-pending-materials-line">{pendingFailedLine(failedNames)}</p> : null}
      {phase === "failed" ? (
        <div className="cp-pending-materials-actions">
          <button type="button" disabled={busy || driving.current} onClick={() => void load().then((list) => drive(list))}>
            Tekrar dene
          </button>
          {failedNames.length ? (
            <button type="button" disabled={busy} onClick={() => void dismiss()}>
              Okunamayanları kaldır
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
