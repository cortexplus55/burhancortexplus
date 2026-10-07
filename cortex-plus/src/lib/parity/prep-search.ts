import { turkishFold } from "@/lib/text/turkish";

/**
 * "Sınav hazırlıklarında ara" — Astra'daki arama sayfası (1 Ekim 2026).
 *
 * Satırlar iki yerden gelir: okulda paylaşılanlar (`school_feed_search`) ve
 * öğrencinin kendi hazırlıkları. Sayaç katılımı sayıyor; ekranda
 * "görüntülenme" denmiyor (bkz. school-feed-view).
 */
export type PrepSearchRow = {
  id: string;
  title: string;
  examType: string | null;
  ownerName: string;
  /** Aynı adlı iki öğrenciyi ayırmak için; kimlik değil, özet. */
  ownerKey: string;
  isOwn: boolean;
  joinCount: number;
  topicCount: number;
  createdAt: string | null;
};

export function toSearchRows(rows: unknown): PrepSearchRow[] {
  if (!Array.isArray(rows)) return [];
  return (rows as Record<string, unknown>[])
    .filter((row) => typeof row.id === "string")
    .map((row) => {
      const ownerName = (row.owner_name as string | null) ?? "Öğrenci";
      return {
        id: row.id as string,
        title: ((row.title as string | null) ?? "").trim() || ((row.exam_type as string | null) ?? "Sınav hazırlığı"),
        examType: (row.exam_type as string | null) ?? null,
        ownerName,
        ownerKey: (row.owner_key as string | null) ?? ownerName,
        isOwn: Boolean(row.is_own),
        joinCount: Number(row.view_count ?? 0),
        topicCount: Number(row.topic_count ?? 0),
        createdAt: (row.created_at as string | null) ?? null,
      };
    });
}

/** Okul satırları ile öğrencinin kendi hazırlıkları; aynı kimlik bir kez. */
export function mergeSearchRows(shared: PrepSearchRow[], own: PrepSearchRow[]): PrepSearchRow[] {
  const seen = new Set<string>();
  const out: PrepSearchRow[] = [];
  for (const row of [...own, ...shared]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function searchPreps(rows: PrepSearchRow[], query: string): PrepSearchRow[] {
  const needle = turkishFold(query.trim());
  if (!needle) return rows;
  return rows.filter((row) =>
    turkishFold(`${row.title} ${row.examType ?? ""} ${row.isOwn ? "sen" : row.ownerName}`).includes(needle),
  );
}

/** "Derse göre" çipleri: en çok hazırlığı olan ders önce. */
export function searchSubjects(rows: PrepSearchRow[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const subject = row.examType?.trim();
    if (subject) counts.set(subject, (counts.get(subject) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))
    .map(([subject]) => subject);
}

export type SearchOwner = { key: string; name: string; isOwn: boolean; count: number };

/** "Oluşturanlara göre": önce sen, sonra en çok paylaşan. */
export function searchOwners(rows: PrepSearchRow[]): SearchOwner[] {
  const owners = new Map<string, SearchOwner>();
  for (const row of rows) {
    const owner = owners.get(row.ownerKey);
    if (owner) owner.count += 1;
    else owners.set(row.ownerKey, { key: row.ownerKey, name: row.isOwn ? "Sen" : row.ownerName, isOwn: row.isOwn, count: 1 });
  }
  return [...owners.values()].sort(
    (a, b) => Number(b.isOwn) - Number(a.isOwn) || b.count - a.count || a.name.localeCompare(b.name, "tr"),
  );
}

/** "Okulunda popüler": başkalarının paylaştığı, katılımı olan hazırlıklar. */
export function popularPreps(rows: PrepSearchRow[], limit = 8): PrepSearchRow[] {
  return rows
    .filter((row) => !row.isOwn && row.joinCount > 0)
    .sort((a, b) => b.joinCount - a.joinCount)
    .slice(0, limit);
}

export function newestPreps(rows: PrepSearchRow[], limit = 8): PrepSearchRow[] {
  return rows
    .filter((row) => !row.isOwn && row.createdAt)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}
