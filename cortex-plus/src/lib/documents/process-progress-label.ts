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
    const w = body.windowsDone ?? body.nextIndex;
    if (w != null) return `map:${String(w)}`;
  }
  if (body.nextPage != null) return `page:${String(body.nextPage)}`;
  return null;
}
