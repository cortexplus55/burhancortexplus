import type { Solution } from "@/lib/solve/question-solver";
import type { SolveEvent, SolveStatus } from "@/lib/solve/solve-run";

/*
  Soru çözücünün istemci tarafı (23 Ekim 2026): `/api/ai/solve` isteği ve olay akışının ekran durumuna çevrilmesi.
  Soru çöz sayfası ve sohbet aynı akışı kullanır; çözüm kartı (`SolutionView`) bu durumu çizer.
*/

export type SolvePhase =
  | { kind: "idle" }
  | { kind: "solving"; stage: "solving" | "checking" }
  | {
      kind: "done";
      solution: Solution;
      status: SolveStatus | "verified" | "revised";
      ms: number;
      note?: string;
      verifying: boolean;
      /** İki bağımsız çözüm aynı cevabı verdi; false ise uzlaştırıldı (24 Ekim 2026). */
      agreed?: boolean;
    }
  | { kind: "error"; message: string; status?: number };

export type SolveDone = Extract<SolvePhase, { kind: "done" }>;

export const SOLVE_STAGE_LABEL = {
  solving: "Soruyu okuyup çözüyorum…",
  checking: "İki çözümü karşılaştırıyorum…",
} as const;

/** Bir olaydan sonraki ekran durumu. "saved" ve "done" durumu değiştirmez. */
export function solvePhaseAfter(phase: SolvePhase, event: SolveEvent): SolvePhase {
  if (event.type === "stage") {
    if (event.stage === "verifying") return phase.kind === "done" ? { ...phase, verifying: true } : phase;
    return phase.kind === "solving" || phase.kind === "idle" ? { kind: "solving", stage: event.stage } : phase;
  }
  if (event.type === "solution") {
    return { kind: "done", solution: event.solution, status: event.status, ms: event.ms, verifying: false, agreed: event.agreed !== false };
  }
  if (event.type === "verified") {
    return phase.kind === "done"
      ? { ...phase, status: phase.status === "uncertain" || !event.confirmed ? phase.status : "verified", verifying: false }
      : phase;
  }
  if (event.type === "revised") {
    return phase.kind === "done"
      ? { ...phase, solution: event.solution, status: "revised", note: event.note, verifying: false }
      : phase;
  }
  if (event.type === "error") return { kind: "error", message: event.message, status: event.status };
  return phase;
}

export type SolveRequest = {
  file?: File | null;
  text?: string;
  /** Sohbetten: çözüm bu sohbete kaydedilir (yoksa yeni sohbet açılır). */
  toChat?: boolean;
  conversationId?: string;
  /** Hazırlıktan: sunucu tekrar listesine eklenebilir soru için imzalı belirteç gönderir. */
  review?: boolean;
  operationId?: string;
  signal?: AbortSignal;
};

/** İsteği atar, her olayı `onEvent`e verir. İstek kurulamazsa hata olayı üretir. */
export async function requestSolve(request: SolveRequest, onEvent: (event: SolveEvent) => void): Promise<void> {
  const { downscaleImage } = await import("@/lib/solve/downscale-image");
  const form = new FormData();
  if (request.file) form.append("file", await downscaleImage(request.file));
  if (request.text?.trim()) form.append("text", request.text.trim());
  form.append("operationId", request.operationId ?? crypto.randomUUID());
  if (request.toChat) form.append("chat", "1");
  if (request.conversationId) form.append("conversationId", request.conversationId);
  if (request.review) form.append("review", "1");
  let response: Response;
  try {
    response = await fetch("/api/ai/solve", { method: "POST", body: form, signal: request.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    onEvent({ type: "error", code: "network", message: "Çevrimdışısın. Yeniden dene.", status: 0 });
    return;
  }
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    onEvent({
      type: "error",
      code: "request_failed",
      message:
        response.status === 400
          ? "Bir soru fotoğrafı seç ya da soruyu yaz (en az birkaç kelime)."
          : (payload.error ?? "Çözüm bu sefer tamamlanamadı; hakkın düşmedi. Yeniden dene."),
      status: response.status,
    });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      let event: SolveEvent;
      try {
        event = JSON.parse(line) as SolveEvent;
      } catch {
        continue;
      }
      onEvent(event);
    }
  }
}
