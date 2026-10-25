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
): (label: string | null) => void {
  let done = 0;
  onProgress?.({ done: 0, total, label: null });
  return (label) => {
    done = Math.min(total, done + 1);
    onProgress?.({ done, total, label });
  };
}

/** Ekrandaki satır: hangi konu bitti, kaç konudan kaçı hazır. */
export function mockProgressLine(progress: MockExamProgress): string {
  if (!progress.total) return "Konular okunuyor…";
  if (progress.done >= progress.total) return `${progress.total} konunun ${progress.total}'i hazır · sorular toparlanıyor…`;
  const head = `${progress.total} konunun ${progress.done}'i hazır`;
  return progress.label ? `${head} · son biten: ${progress.label}` : `${head} · konular yazılıyor…`;
}

export type MockStreamLine =
  | ({ type: "progress" } & MockExamProgress)
  | { type: "done"; status: number; data: Record<string, unknown> };

/**
 * Kurulum isteği: ilerleme satırlarını `onProgress`'e verir, sonucu döndürür. Üretim düşüşünde bir kez
 * kendiliğinden yeniden ister (`postJsonWithRetry` ile aynı kural). Ağ hatası fırlatılır.
 */
export async function postMockExamWithProgress(
  url: string,
  body: () => unknown,
  onProgress: (progress: MockExamProgress) => void,
  options: { delayMs?: number } = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const once = async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify(body()),
    });
    if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) {
      return { status: res.status, data: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
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
        if (line.type === "progress") onProgress({ done: line.done, total: line.total, label: line.label ?? null });
        else if (line.type === "done") final = line;
      }
      if (done) break;
    }
    return final ? { status: final.status, data: final.data } : { status: 500, data: { code: "generation_failed" } };
  };
  const first = await once();
  if (first.status < 300 || !isRetryableFailure(first.status, first.data.code ?? first.data.error)) return first;
  await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? AUTO_RETRY_DELAY_MS));
  return once();
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
