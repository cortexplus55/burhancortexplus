/**
 * Yazılı deneme kurulumunun ilerlemesi (25 Ekim 2026, canlı test P1-1).
 *
 * Ekran 1,8 sn'de bir "Konu N hazırlanıyor" ekliyor ve dördüncü satırda duruyordu; canlıda 3,5 dk
 * boyunca "Konu 3 hazırlanıyor" yazdı. Sayı artık biten konulardan gelir: uç NDJSON satırları akıtır
 * (`{type:"progress",done,total,label}`), son satır sonuçtur.
 */
import { AUTO_RETRY_DELAY_MS, isRetryableFailure } from "@/lib/learning/generation-retry";

export type MockExamProgress = { done: number; total: number; label: string | null };

export function mockProgressCounter(
  total: number,
  onProgress?: (progress: MockExamProgress) => void,
  initialDone = 0,
): (label: string | null) => void {
  let done = Math.max(0, Math.min(total, initialDone));
  onProgress?.({ done, total, label: null });
  return (label) => {
    done = Math.min(total, done + 1);
    onProgress?.({ done, total, label });
  };
}

/** Aynı toplamda sayı geri gitmez. Yeni istek 0 yazsa da ekran kaldığı yerde kalır. */
export function monotonicProgress(previous: MockExamProgress | null, next: MockExamProgress): MockExamProgress | null {
  if (previous && previous.total === next.total && next.done < previous.done) return previous;
  return next;
}

/** Ekrandaki satır: hangi konu bitti, kaç konudan kaçı hazır. */
export function mockProgressLine(progress: MockExamProgress): string {
  if (!progress.total) return "Konular okunuyor…";
  if (progress.done >= progress.total) return `${progress.total} konunun ${progress.total}'i hazır · sorular toparlanıyor…`;
  const head = `${progress.total} konunun ${progress.done}'i hazır`;
  return progress.label ? `${head} · son biten: ${progress.label}` : `${head} · konular yazılıyor…`;
}

export type MockStreamLine =
  | ({ type: "progress" } & MockExamProgress & { resumeId?: string })
  | { type: "done"; status: number; data: Record<string, unknown> };

/**
 * Kurulum isteği: ilerleme satırlarını `onProgress`'e verir, sonucu döndürür. Üretim düşüşünde bir kez
 * kendiliğinden yeniden ister (`postJsonWithRetry` ile aynı kural). Ağ hatası fırlatılır.
 */
export async function postMockExamWithProgress(
  url: string,
  body: () => unknown,
  onProgress: (progress: MockExamProgress) => void,
  options: { delayMs?: number; pollMs?: number } = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  let resumeId: string | null = null;
  let floor: MockExamProgress | null = null;
  const emit = (progress: MockExamProgress) => {
    const next = monotonicProgress(floor, progress);
    if (!next) return;
    floor = next;
    if (next === progress) onProgress(next);
  };
  const once = async () => {
    const base = (body() ?? {}) as Record<string, unknown>;
    const payload = resumeId ? { ...base, resumeId } : base;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify(payload),
    });
    if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) {
      const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
      if (typeof data.resumeId === "string") resumeId = data.resumeId;
      return { status: res.status, data };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let final: Extract<MockStreamLine, { type: "done" }> | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const split = splitNdjson(done ? `${buffer}\n` : buffer);
      buffer = split.rest;
      for (const line of split.lines) {
        if (line.type === "progress") {
          if (line.resumeId) resumeId = line.resumeId;
          emit({ done: line.done, total: line.total, label: line.label ?? null });
        } else if (line.type === "done") final = line;
      }
      if (done) break;
    }
    if (final) {
      if (typeof final.data.resumeId === "string") resumeId = final.data.resumeId;
      return { status: final.status, data: final.data };
    }
    return { status: 500, data: { code: "generation_failed", ...(resumeId ? { resumeId } : {}) } };
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let freshRetries = 0;
  let runningPolls = 0;
  let chunkSteps = 0;
  let streamErrors = 0;
  let last: { status: number; data: Record<string, unknown> } = { status: 500, data: { code: "generation_failed" } };
  while (chunkSteps <= 48) {
    try {
      last = await once();
    } catch (error) {
      if (!resumeId) throw error;
      streamErrors += 1;
      if (streamErrors > 8) throw error;
      await wait(options.delayMs ?? AUTO_RETRY_DELAY_MS);
      continue;
    }
    if (typeof last.data.resumeId === "string") resumeId = last.data.resumeId;
    if (resumeId && typeof last.data.resumeId !== "string") last = { ...last, data: { ...last.data, resumeId } };
    if (last.status < 300 && last.data.examId) return last;
    if (last.status < 300 && last.data.resumeId && !last.data.examId) {
      if (last.data.running === true) {
        runningPolls += 1;
        if (runningPolls > 180) return last;
        await wait(options.pollMs ?? 2000);
        continue;
      }
      runningPolls = 0;
      chunkSteps += 1;
      if (chunkSteps > 48) return last;
      await wait(options.delayMs ?? 40);
      continue;
    }
    const code = last.data.code ?? last.data.error;
    if (!isRetryableFailure(last.status, code)) return last;
    if (resumeId) {
      chunkSteps += 1;
      if (chunkSteps > 48) return last;
      await wait(options.delayMs ?? AUTO_RETRY_DELAY_MS);
      continue;
    }
    if (freshRetries >= 1) return last;
    freshRetries += 1;
    await wait(options.delayMs ?? AUTO_RETRY_DELAY_MS);
  }
  return last;
}

/** Arka plan işi bitene kadar yalnız ilerleme. Ağ hatası fırlatılır. */
export async function pollGenerationJob(
  jobId: string,
  onProgress: (progress: MockExamProgress) => void,
): Promise<{ examId?: string; failed?: boolean }> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const res = await fetch(`/api/learning/jobs/${jobId}`, { cache: "no-store" });
    if (!res.ok) throw new Error("job_poll_failed");
    const data = (await res.json().catch(() => ({}))) as {
      state?: string;
      examId?: string | null;
      progress?: { ready?: number; promised?: number };
    };
    const ready = data.progress?.ready ?? 0;
    const promised = data.progress?.promised ?? 0;
    onProgress({ done: ready, total: promised || ready, label: null });
    if (data.state === "done" && data.examId) return { examId: data.examId };
    if (data.state === "failed") return { failed: true };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return { failed: true };
}

/** NDJSON gövdesini satır satır okur; tam satırları döndürür, yarım kalanı biriktirir. */
export function splitNdjson(buffer: string): { lines: MockStreamLine[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const lines: MockStreamLine[] = [];
  for (const part of parts) {
    const text = part.trim();
    if (!text) continue;
    try {
      lines.push(JSON.parse(text) as MockStreamLine);
    } catch {
      // Bozuk satır atlanır; son satır sonucu taşır.
    }
  }
  return { lines, rest };
}
