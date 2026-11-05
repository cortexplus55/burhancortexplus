/** Never pass a user-editable database path to privileged Storage unchecked. */
export function isOwnedDocumentPath(path: unknown, userId: string, documentId: string): path is string {
  if (typeof path !== "string" || !path.startsWith(`${userId}/${documentId}/`)) return false;
  return !path.split("/").some((part) => part === ".." || part === ".") && !path.includes("\\");
}

/**
 * Okuma için: parça kopyası (`documents.part_of`, document-head.ts) ana belgenin dosyasını paylaşır, yolu
 * `<kullanıcı>/<ana belge>/…` klasöründedir. Aynı kullanıcının ana belge klasörü de kabul edilir.
 * Silme ve yükleme doğrulaması bunu KULLANMAZ: parça ana belgenin dosyasına dokunmamalı (`isOwnedDocumentPath`).
 */
export function isOwnedDocumentStoragePath(
  path: unknown,
  userId: string,
  doc: { id: string; part_of?: string | null },
): path is string {
  if (isOwnedDocumentPath(path, userId, doc.id)) return true;
  return typeof doc.part_of === "string" && doc.part_of.length > 0 && isOwnedDocumentPath(path, userId, doc.part_of);
}
