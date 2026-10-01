/**
 * Modelin başlık cevabını kullanılabilir hâle getirir; olmuyorsa null.
 * Saf fonksiyon: "server-only" dosyasından ayrı, test edilebilsin diye.
 */
export function cleanConversationTitle(raw: string): string | null {
  const line = raw
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) return null;
  const title = line
    .replace(/^(?:başlık|title)\s*:\s*/i, "")
    .replace(/^[\s"'“”‘’«»*#-]+|[\s"'“”‘’«»*.]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const letters = title.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3 || title.length > 70) return null;
  return title;
}
