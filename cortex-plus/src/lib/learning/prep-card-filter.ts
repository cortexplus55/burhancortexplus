import { foldForSearch, matchesSearch } from "@/lib/text/search-fold";

/*
  "Sınav hazırlıklarım" anlık araması ve ders süzgeci (20 Kasım 2026, Faz 3). Arama hazırlığın adında ve sınav
  türünde (`exam_type`, kartta dersin adı) çalışır; süzgeç listede gerçekten olan sınav türlerinden kurulur.
  Saf; ağ isteği yok.
*/

export type PrepFilterCard = { title: string; examType?: string | null };

export type PrepFilter = { query: string; subject: string | null };

export const EMPTY_PREP_FILTER: PrepFilter = { query: "", subject: null };

/** Listedeki sınav türleri, ilk görünüş sırasıyla; yazım farkı (büyük/küçük harf) tek seçenek sayılır. */
export function prepSubjects(cards: readonly PrepFilterCard[]): string[] {
  const seen = new Map<string, string>();
  for (const card of cards) {
    const label = (card.examType ?? "").trim();
    const key = foldForSearch(label);
    if (key && !seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()];
}

export function isPrepFilterActive(filter: PrepFilter): boolean {
  return filter.query.trim() !== "" || filter.subject !== null;
}

export function filterPrepCards<T extends PrepFilterCard>(cards: readonly T[], filter: PrepFilter): T[] {
  const subjectKey = filter.subject ? foldForSearch(filter.subject) : null;
  return cards.filter(
    (card) =>
      (subjectKey === null || foldForSearch(card.examType) === subjectKey) &&
      matchesSearch([card.title, card.examType], filter.query),
  );
}
