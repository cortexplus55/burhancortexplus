/**
 * Anında havuz dersi açılışı (3 Kasım 2026, #543 deneme deseninin ders hâli): yol sayfası sıradaki havuz dersinin
 * ilk ekranını (başlık + ilk bölüm metni; paylaşımlı, 0 kredi, cevap anahtarı yok) sunucu çiziminde taşır ve belleğe
 * yazar. Düğüm sayfasının loading sınırı bunu okuyup ilk ders metnini sunucu çizimi gelmeden gösterir; sayfa
 * gelince gerçek ders yerine geçer. Kayıt yoksa ders biçimli iskelet (boş ekran yok). Süre sınırı 10 dk.
 */
const MAX_AGE_MS = 10 * 60_000;

export type LessonPreview = { title: string; heading: string; paragraphs: string[] };
export type InstantLesson = LessonPreview & { prepId: string; nodeId: string; at: number };

let current: InstantLesson | null = null;

export function validPreview(value: unknown): value is LessonPreview {
  const v = value as LessonPreview | null;
  return Boolean(
    v &&
      typeof v.title === "string" &&
      typeof v.heading === "string" &&
      Array.isArray(v.paragraphs) &&
      v.paragraphs.length > 0 &&
      v.paragraphs.every((p) => typeof p === "string"),
  );
}

export function primeInstantLesson(input: { prepId: string; nodeId: string; preview: unknown }, now = Date.now()): boolean {
  if (!validPreview(input.preview)) return false;
  current = { ...input.preview, prepId: input.prepId, nodeId: input.nodeId, at: now };
  return true;
}

export function peekInstantLesson(prepId: string, nodeId: string, now = Date.now()): InstantLesson | null {
  if (!current || current.prepId !== prepId || current.nodeId !== nodeId) return null;
  if (now - current.at > MAX_AGE_MS) {
    current = null;
    return null;
  }
  return current;
}

export function clearInstantLesson(): void {
  current = null;
}

/** Havuz anlatımının ilk bölümünden önizleme (yalın metin; ** işaretleri atılır, en çok 3 paragraf / 1.400 karakter). */
export function previewFromSections(title: string, sections: { heading: string; explanation: string }[]): LessonPreview | null {
  const first = sections[0];
  if (!first?.explanation?.trim()) return null;
  const paragraphs: string[] = [];
  let budget = 1_400;
  for (const raw of first.explanation.replace(/\*\*/g, "").split(/\n{1,}/)) {
    const p = raw.trim();
    if (!p || budget <= 0) continue;
    paragraphs.push(p.length > budget ? `${p.slice(0, budget).replace(/\s+\S*$/, "")}…` : p);
    budget -= p.length;
    if (paragraphs.length >= 3) break;
  }
  return paragraphs.length ? { title: title.slice(0, 160), heading: first.heading.slice(0, 160), paragraphs } : null;
}
