"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useScreenAwake } from "@/lib/documents/use-universal-upload";
import {
  PENDING_CREDITS_LINE,
  PENDING_DONE_VISIBLE_MS,
  PENDING_MATERIALS_EVENT,
  PENDING_PAUSED_TITLE,
  PENDING_READ_ALL,
  PENDING_STALLED_LINE,
  PENDING_TITLE,
  pendingDoneLine,
  pendingDoneTitle,
  pendingFailedLine,
  pendingPausedLine,
  pendingProgress,
  pendingReadingLine,
  pendingWindowAddedLine,
  pendingWindowNextLine,
  pendingWindowTitle,
} from "@/lib/learning/pending-materials-copy";
import { messageFromProcessBody } from "@/lib/documents/process-user-message";
import { postDocumentProcess, requestDocumentProcessing } from "@/lib/documents/process-session";
import "@/styles/pending-materials.css";

type Pending = {
  documentId: string;
  fileName: string;
  status: string;
  error: string | null;
  pagesDone: number | null;
  pageCount: number | null;
  attachedThrough?: number;
  windowed?: boolean;
  paused?: boolean;
};

type Advance = {
  state?: string;
  addedTopics?: number;
  mergedTopics?: number;
  failed?: { fileName?: string; code?: string; retryable?: boolean };
};

/** Sunucu ilerlemesi bu aralıkla okunur (işçi arkada sürer; şerit yalnız izler ve dürter). */
const POLL_MS = 4_000;
/** İlerleme bu kadar durursa işçi yeniden dürtülür (kendini sürdüren zincir kopmuş olabilir). */
const NUDGE_MS = 45_000;
/** Belge başka istekte okunuyor/yükleniyor: kısa aralıkla yeniden. */
const WAITING_RETRY_MS = 5_000;

function eagerKey(prepId: string) {
  return `cp:pending-eager:${prepId}`;
}

function readEager(prepId: string): boolean {
  try {
    return window.localStorage.getItem(eagerKey(prepId)) === "1";
  } catch {
    return false;
  }
}

function attachedSum(items: readonly Pending[]): number {
  return items.reduce((sum, item) => sum + (item.attachedThrough ?? 0), 0);
}

/**
 * Hızlı başlatmanın hazırlık sayfasındaki şeridi (31 Ekim 2026, ürün sahibi: "kullanıcı beklemesin; kalan sayfalar
 * arkada işlensin"). Kurulum hazır olan materyalle kuruldu; okunmakta olan belgeler hazırlığa bekleyen olarak bağlı.
 *
 * Pencereli işleme (31 Ekim 2026, ikinci tur): okuma, harita ve ekleme sunucudaki pencere işçisinde
 * (pending-windows.ts); büyük kitap 40'ar sayfalık pencerelerle yola girer, işçi süresi dolunca kendini sürdürür.
 * Şerit işçiyi dürter, ilerlemeyi okur ("110 / 500 sayfa yoluna eklendi"), her yeni pencerede yolu yeniler.
 * Taranmış kitap öğrenci ilerledikçe okunur; "Hepsini şimdi oku" beklemeden okutur.
 *
 * Hazırlık sayfası şeridi her zaman bağlar: bekleyen yoksa (`initialPending` 0) istek atmaz ve çizmez; "Materyal ekle"
 * büyük belge bıraktığında olayla uyanır.
 */
export function PendingMaterialsBanner({ prepId, initialPending }: { prepId: string; initialPending?: number }) {
  const router = useRouter();
  // Etkiler router nesnesine bağlanmaz (her çizimde yeniden koşup sunucuyu boşuna yoklamasın).
  const routerRef = useRef(router);
  routerRef.current = router;
  const [items, setItems] = useState<Pending[]>([]);
  const [phase, setPhase] = useState<"idle" | "working" | "paused" | "credits" | "done" | "failed">("idle");
  const [line, setLine] = useState<string | null>(null);
  const [doneTitle, setDoneTitle] = useState<string | null>(null);
  const [failedNames, setFailedNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(initialPending === undefined || initialPending > 0);
  const alive = useRef(true);
  const kicking = useRef(false);
  const readingWaiting = useRef(false);
  const itemsRef = useRef<Pending[]>([]);
  itemsRef.current = items;
  const lastProgressAt = useRef(Date.now());
  const lastAttached = useRef<number | null>(null);
  const firstTopicCount = useRef<number | null>(null);
  /** Son pencere eklendiğinde yoldaki konu sayısı: "+N konu" yalnız o pencereninki. */
  const topicsAtAttach = useRef<number | null>(null);
  const topicCount = useRef<number | null>(null);
  const hadItems = useRef(false);
  // Kalan sayfalar işlenirken ekran kararmasın (31 Ekim 2026).
  useScreenAwake(phase === "working");

  const load = useCallback(async (): Promise<Pending[] | null> => {
    try {
      const res = await fetch(`/api/learning/exam-prep/pending-materials?prepId=${prepId}`, { cache: "no-store" });
      if (!res.ok) return null;
      const payload = (await res.json().catch(() => ({}))) as { materials?: Pending[]; topicCount?: number };
      if (typeof payload.topicCount === "number") {
        topicCount.current = payload.topicCount;
        if (firstTopicCount.current == null) firstTopicCount.current = payload.topicCount;
      }
      return Array.isArray(payload.materials) ? payload.materials : [];
    } catch {
      return null;
    }
  }, [prepId]);

  const finish = useCallback(() => {
    const added = Math.max(0, (topicCount.current ?? 0) - (firstTopicCount.current ?? topicCount.current ?? 0));
    setDoneTitle(pendingDoneTitle(added));
    setLine(pendingDoneLine(0));
    setPhase("done");
    routerRef.current.refresh();
  }, []);

  const readWaiting = useCallback(async () => {
    if (readingWaiting.current) return;
    const item = itemsRef.current.find((entry) => entry.pageCount == null || (entry.pagesDone ?? 0) < entry.pageCount);
    if (!item) return;
    readingWaiting.current = true;
    try {
      await requestDocumentProcessing({
        documentId: item.documentId,
        post: (body) => postDocumentProcess({ ...body, prepId, deferMap: true }),
      });
    } finally {
      readingWaiting.current = false;
    }
  }, [prepId]);

  const kick = useCallback(async (eager = readEager(prepId)) => {
    if (kicking.current) return;
    kicking.current = true;
    try {
      const res = await fetch("/api/learning/exam-prep/pending-materials/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, ...(eager ? { eager: true } : {}) }),
      }).catch(() => null);
      if (!alive.current) return;
      const payload = ((await res?.json().catch(() => ({}))) ?? {}) as Advance;
      const state = res?.ok ? payload.state : "deadline";
      if (state === "paused") setPhase("paused");
      else if (state === "paused_credits") {
        setPhase("credits");
        setLine(PENDING_CREDITS_LINE);
      } else if (state === "failed") {
        const name = payload.failed?.fileName;
        setFailedNames(name && payload.failed?.retryable === false ? [name] : []);
        setLine(payload.failed?.retryable === false ? null : messageFromProcessBody({ code: payload.failed?.code }) || PENDING_STALLED_LINE);
        setPhase("failed");
      } else if (state === "waiting") {
        // Henüz okunmamış belge (Word/sunu, yarım kalmış okuma): eskisi gibi işleme ucuyla okutulur, sonra işçi sürer.
        void readWaiting().finally(() => setTimeout(() => alive.current && void kick(), WAITING_RETRY_MS));
      }
      lastProgressAt.current = Date.now();
    } finally {
      kicking.current = false;
    }
  }, [prepId, readWaiting]);

  // "Materyal ekle" büyük belgeyi bekleyen yazdı: şerit uyanır.
  useEffect(() => {
    const wake = () => setWatching(true);
    window.addEventListener(PENDING_MATERIALS_EVENT, wake);
    return () => window.removeEventListener(PENDING_MATERIALS_EVENT, wake);
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!watching) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async (first: boolean) => {
      const fresh = await load();
      if (!alive.current || fresh == null) return;
      setItems(fresh);
      if (!fresh.length) {
        if (hadItems.current) finish();
        if (timer) clearInterval(timer);
        timer = null;
        return;
      }
      hadItems.current = true;
      const attached = attachedSum(fresh);
      if (lastAttached.current != null && attached > lastAttached.current) {
        // Yeni pencere yolda: yol yenilenir, öğrenciye hangi sayfaların eklendiği söylenir.
        const before = lastAttached.current;
        const now = topicCount.current ?? 0;
        const topics = Math.max(0, now - (topicsAtAttach.current ?? firstTopicCount.current ?? now));
        topicsAtAttach.current = now;
        setLine(pendingWindowAddedLine(before + 1, attached, topics));
        routerRef.current.refresh();
        lastProgressAt.current = Date.now();
      }
      if (lastAttached.current == null || attached !== lastAttached.current) lastAttached.current = attached;
      const pausedAll = fresh.every((item) => item.paused);
      setPhase((current) => (current === "failed" || current === "credits" ? current : pausedAll ? "paused" : "working"));
      if (first || (!pausedAll && Date.now() - lastProgressAt.current > NUDGE_MS)) void kick();
    };
    void tick(true);
    timer = setInterval(() => void tick(false), POLL_MS);
    return () => {
      alive.current = false;
      if (timer) clearInterval(timer);
    };
  }, [finish, kick, load, watching]);

  // Bitiş bildirimi en az 8 sn görünür, sonra şerit kalkar (yeni konular yolda zaten görünüyor).
  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => {
      if (!alive.current) return;
      setPhase("idle");
      setDoneTitle(null);
      setLine(null);
      hadItems.current = false;
    }, PENDING_DONE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  async function readAll() {
    try {
      window.localStorage.setItem(eagerKey(prepId), "1");
    } catch {
      // Tercih yalnız bu tarayıcıda hatırlanır; okunamazsa istek yine "hepsini oku" der.
    }
    setPhase("working");
    await kick(true);
  }

  async function retry() {
    setFailedNames([]);
    setLine(null);
    setPhase("working");
    await kick();
  }

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
      setItems((await load()) ?? []);
      setPhase("working");
      void kick();
    } finally {
      setBusy(false);
    }
  }

  if (phase === "done") {
    return (
      <section className="cp-pending-materials cp-pending-materials--done" role="status" aria-live="polite">
        <p className="cp-pending-materials-title">{doneTitle}</p>
        {line ? <p className="cp-pending-materials-line">{line}</p> : null}
      </section>
    );
  }
  if (!items.length && phase !== "failed") return null;

  const windowed = items.some((item) => item.windowed);
  const total = items.reduce((sum, item) => sum + (item.pageCount ?? 0), 0);
  const attached = attachedSum(items);
  const reading = pendingProgress(items);
  const percent = windowed
    ? total > 0 ? Math.round((attached / total) * 100) : 4
    : reading.total > 0 ? Math.round((reading.done / reading.total) * 100) : 8;
  const title = phase === "paused" ? PENDING_PAUSED_TITLE : windowed ? pendingWindowTitle(attached, total) : PENDING_TITLE;
  const mainLine = phase === "paused"
    ? pendingPausedLine(attached, total)
    : windowed
      ? pendingWindowNextLine(total)
      : pendingReadingLine(reading.done, reading.total);

  return (
    <section
      className={`cp-pending-materials${phase === "failed" ? " cp-pending-materials--failed" : ""}`}
      role="status"
      aria-live="polite"
    >
      <p className="cp-pending-materials-title">{title}</p>
      <p className="cp-pending-materials-line">{phase === "failed" || phase === "credits" ? line ?? mainLine : mainLine}</p>
      {phase === "working" && line ? <p className="cp-pending-materials-line">{line}</p> : null}
      {phase !== "failed" ? (
        <div className="cp-pending-materials-bar" aria-hidden>
          <span style={{ width: `${Math.max(4, percent)}%` }} />
        </div>
      ) : null}
      {failedNames.length ? <p className="cp-pending-materials-line">{pendingFailedLine(failedNames)}</p> : null}
      {phase === "paused" ? (
        <div className="cp-pending-materials-actions">
          <button type="button" onClick={() => void readAll()}>
            {PENDING_READ_ALL}
          </button>
        </div>
      ) : null}
      {phase === "failed" ? (
        <div className="cp-pending-materials-actions">
          <button type="button" disabled={busy} onClick={() => void retry()}>
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
