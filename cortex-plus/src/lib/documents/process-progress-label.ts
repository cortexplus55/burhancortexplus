/** İstemci ilerleme metni ve duraksama algısı için parmak izi. */

/** Ordered stages shown on the progress bar (student-facing, no errors). */
export const PROCESS_PROGRESS_STAGES = [
  "extract",
  "prepare",
  "oneshot",
  "persist",
] as const;

export type ProcessProgressStage = (typeof PROCESS_PROGRESS_STAGES)[number];

export function resolveProcessProgressStage(
  body: Record<string, unknown>,
): ProcessProgressStage | null {
  const phase = body.phase;
  if (phase === "extract") return "extract";
  if (phase === "map") {
    const stage = typeof body.stage === "string" ? body.stage : null;
    if (stage === "prepare") return "prepare";
    if (stage === "oneshot" || stage === "outline" || stage === "windows") {
      return "oneshot";
    }
    if (stage === "persist") return "persist";
    return "oneshot";
  }
  return null;
}

export function processProgressRatio(body: Record<string, unknown>): number | null {
  const stage = resolveProcessProgressStage(body);
  if (!stage) return null;
  const stageIndex = PROCESS_PROGRESS_STAGES.indexOf(stage);
  if (stage === "extract") {
    const nextPage = Number(body.nextPage);
    const total = Number(body.pageCount);
    if (Number.isFinite(nextPage) && Number.isFinite(total) && total > 0) {
      const done = Math.min(Math.max(0, nextPage - 1), total);
      const extractShare = 1 / PROCESS_PROGRESS_STAGES.length;
      return Math.min(0.99, (stageIndex + done / total) * extractShare);
    }
  }
  return Math.min(0.99, (stageIndex + 1) / PROCESS_PROGRESS_STAGES.length);
}

export function formatDocumentProcessProgress(
  body: Record<string, unknown>,
): string | null {
  const phase = body.phase;
  if (phase === "extract") {
    const nextPage = Number(body.nextPage);
    const total = Number(body.pageCount);
    if (Number.isFinite(nextPage) && Number.isFinite(total) && total > 0) {
      const done = Math.min(Math.max(0, nextPage - 1), total);
      return `Belgen okunuyor: ${done}/${total} sayfa`;
    }
    return "Belgen okunuyor…";
  }
  if (phase === "map") {
    const stage = typeof body.stage === "string" ? body.stage : null;
    if (stage === "oneshot" || stage === "outline") {
      return "Çalışma yolu çıkarılıyor…";
    }
    if (stage === "persist") {
      return "Konular kaydediliyor…";
    }
    if (stage === "prepare") {
      return "Konular hazırlanıyor…";
    }
    const doneRaw = body.windowsDone ?? body.nextIndex;
    const totalRaw = body.windowCount ?? body.windowsTotal ?? body.mapWindows;
    const done = Number(doneRaw);
    const total = Number(totalRaw);
    if (Number.isFinite(done) && Number.isFinite(total) && total > 0) {
      return `Konular çıkarılıyor: ${Math.min(done, total)}/${total}`;
    }
    return "Konular çıkarılıyor…";
  }
  return null;
}

export function processProgressFingerprint(
  body: Record<string, unknown>,
): string | null {
  if (body.phase === "extract" && body.nextPage != null) {
    return `extract:${String(body.nextPage)}`;
  }
  if (body.phase === "map") {
    if (body.leaseBusy === true) {
      const w = body.windowsDone ?? body.nextIndex ?? "busy";
      return `map-lease:${String(w)}`;
    }
    const stage = typeof body.stage === "string" ? body.stage : "windows";
    const w = body.windowsDone ?? body.nextIndex;
    if (w != null) return `map:${stage}:${String(w)}`;
    return `map:${stage}`;
  }
  if (body.nextPage != null) return `page:${String(body.nextPage)}`;
  return null;
}
