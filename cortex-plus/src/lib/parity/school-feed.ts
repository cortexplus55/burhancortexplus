/**
 * Okul akışı görünümü.
 *
 * Akış `school_feed()` RPC'sinden gelir — profiles RLS'i başkasının satırını
 * okutmadığı için, yalnızca akışın ihtiyaç duyduğu alanları döndüren bir
 * fonksiyon kullanılıyor. Buradaki iş, o satırları arayüzün beklediği biçime
 * çevirmek ve "POPÜLER" gibi türetilmiş rozetleri hesaplamak.
 */

export type SchoolFeedRow = {
  id: string;
  title: string | null;
  examType: string | null;
  examDate: string | null;
  viewCount: number;
  ownerName: string;
  isOwn: boolean;
  topicCount: number;
};

export type SchoolSummary = {
  schoolId: string;
  schoolName: string;
  memberCount: number;
  sharedCount: number;
};

export function toFeedRows(rows: unknown): SchoolFeedRow[] {
  if (!Array.isArray(rows)) return [];
  return (rows as Record<string, unknown>[])
    .filter((r) => typeof r.id === "string")
    .map((r) => ({
      id: r.id as string,
      title: (r.title as string | null) ?? null,
      examType: (r.exam_type as string | null) ?? null,
      examDate: (r.exam_date as string | null) ?? null,
      viewCount: Number(r.view_count ?? 0),
      ownerName: (r.owner_name as string | null) ?? "Öğrenci",
      isOwn: Boolean(r.is_own),
      topicCount: Number(r.topic_count ?? 0),
    }));
}

export function toSummary(rows: unknown): SchoolSummary | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  if (typeof r.school_id !== "string") return null;
  return {
    schoolId: r.school_id,
    schoolName: (r.school_name as string | null) ?? "Okulum",
    memberCount: Number(r.member_count ?? 0),
    sharedCount: Number(r.shared_count ?? 0),
  };
}

/**
 * "POPÜLER" rozeti. Eşik sabit bir sayı değil — akışın kendi dağılımına göre:
 * en çok görüntülenen ve ortalamanın belirgin üstünde olanlar. Küçük bir okulda
 * 3 görüntülenme de popüler sayılabilir, kalabalık bir okulda sayılmaz.
 * Herkesi popüler etiketlemek rozeti anlamsızlaştırırdı.
 */
export function popularIds(rows: SchoolFeedRow[]): Set<string> {
  const withViews = rows.filter((r) => r.viewCount > 0);
  if (withViews.length < 3) return new Set();
  const avg =
    withViews.reduce((sum, r) => sum + r.viewCount, 0) / withViews.length;
  return new Set(
    withViews.filter((r) => r.viewCount >= Math.max(2, avg * 1.5)).map((r) => r.id),
  );
}

/** Akıştaki derslerin listesi — filtre çipleri için. */
export function feedSubjects(rows: SchoolFeedRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.examType) set.add(row.examType);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "tr"));
}

export function filterBySubject(
  rows: SchoolFeedRow[],
  subject: string | null,
): SchoolFeedRow[] {
  if (!subject) return rows;
  return rows.filter((r) => r.examType === subject);
}
