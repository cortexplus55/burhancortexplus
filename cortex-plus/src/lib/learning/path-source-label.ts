/**
 * Çok dosyalı hazırlıkta "s.1,2,3" hangi dosyanın sayfası belli olmaz.
 * Tek dosyaysa adıyla yazılır; birden fazlaysa sayfa listesi gösterilmez.
 */

export function formatPageList(pages: number[]): string {
  const sorted = [...new Set(pages.filter((page) => Number.isInteger(page) && page > 0))].sort(
    (a, b) => a - b,
  );
  if (!sorted.length) return "";
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const page of sorted.slice(1)) {
    if (page === prev + 1) {
      prev = page;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = prev = page;
  }
  parts.push(start === prev ? String(start) : `${start}–${prev}`);
  return parts.join(", ");
}

export function fileStem(fileName: string): string {
  return fileName.trim().replace(/\.[^.]+$/, "");
}

export function sourceCitation(
  refs: { fileName?: string | null; pages?: number[] }[] | undefined,
  fallbackPages: number[] = [],
): { label: string | null; omitBarePages: boolean } {
  const named = (refs ?? []).filter((ref) => ref.fileName?.trim());
  const files = [...new Set(named.map((ref) => ref.fileName!.trim()))];
  if (files.length > 1) return { label: null, omitBarePages: true };
  if (files.length !== 1) return { label: null, omitBarePages: false };
  const pages = named.flatMap((ref) => ref.pages ?? []);
  const list = formatPageList(pages.length ? pages : fallbackPages);
  if (!list) return { label: null, omitBarePages: true };
  return { label: `${fileStem(files[0])} s.${list}`, omitBarePages: true };
}
