/** Never pass a user-editable database path to privileged Storage unchecked. */
export function isOwnedDocumentPath(path: unknown, userId: string, documentId: string): path is string {
  if (typeof path !== "string" || !path.startsWith(`${userId}/${documentId}/`)) return false;
  return !path.split("/").some((part) => part === ".." || part === ".") && !path.includes("\\");
}
