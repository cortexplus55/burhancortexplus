/** İstemci ilerleme metni ve duraksama algısı için parmak izi. */

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
  }
  if (phase === "map") {
    const stage = typeof body.stage === "string" ? body.stage : null;
    if (stage === "outline" || stage === "persist") {
      return "Konular düzenleniyor…";
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
