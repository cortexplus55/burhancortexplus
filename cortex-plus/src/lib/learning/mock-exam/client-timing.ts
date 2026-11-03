/**
 * Deneme açılışının istemci zamanlaması (3 Kasım 2026): "Sınavı başlat" tıklaması → POST yanıtı → sınav sayfasında
 * ilk sorunun çizilmesi. Kurulum sayfası sessionStorage'a yazar, sınav sayfası bir kez okuyup lesson_timings'e
 * (kind 'mock_exam', path 'client') gönderir. Kaldırmak kolay: bu dosya + iki çağrı yeri.
 */
const KEY = "cortex:mock-timing";
const MAX_AGE_MS = 120_000;

export type MockClientTiming = { examId: string; clickAt: number; postMs: number };

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberMockTiming(t: MockClientTiming, s: Store | null = store()): void {
  try {
    s?.setItem(KEY, JSON.stringify(t));
  } catch {
    /* depolama kapalıysa ölçüm yok */
  }
}

/** Bu sınava ait taze kayıt varsa döndürür ve siler (bir kez). */
export function takeMockTiming(examId: string, now = Date.now(), s: Store | null = store()): { clickToScreenMs: number; requestMs: number } | null {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as MockClientTiming;
    if (t.examId !== examId) return null;
    s?.removeItem(KEY);
    const ms = now - t.clickAt;
    if (!(ms >= 0 && ms <= MAX_AGE_MS)) return null;
    return { clickToScreenMs: ms, requestMs: Math.max(0, Math.round(t.postMs)) };
  } catch {
    return null;
  }
}

export function sendMockTiming(examId: string): void {
  const t = takeMockTiming(examId);
  if (!t) return;
  void fetch("/api/learning/lesson-timing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "mock_exam", ...t }),
    keepalive: true,
  }).catch(() => undefined);
}
