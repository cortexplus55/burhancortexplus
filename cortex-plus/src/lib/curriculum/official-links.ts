/**
 * İlgili resmî kaynaklar (1 Kasım 2026): yalnız dış resmî bağlantılar (ÖSYM, MEB, YÖK); içerik kopyalanmaz.
 * Her adres eklenirken canlıda curl ile 200 döndüğü doğrulandı (`verifiedAt`); 404 veren adres listeye girmez.
 * Veritabanındaki `official_links` tablosu bu dosyanın aynasıdır (migration 20261101210000_official_links.sql).
 */
import data from "@/lib/curriculum/official-links.json";

export type OfficialLinkExam = "yks" | "lgs" | "kpss" | "ales" | "dgs" | "yds" | "tus" | "dus";
export type OfficialLink = { exam: OfficialLinkExam; title: string; url: string; publisher: string };

export const OFFICIAL_LINKS_VERIFIED_AT: string = data.verifiedAt;
export const OFFICIAL_LINKS = data.links as OfficialLink[];

export function officialLinksFor(exam: string | null | undefined): OfficialLink[] {
  if (!exam) return [];
  const key = exam.toLowerCase();
  return OFFICIAL_LINKS.filter((l) => l.exam === key);
}
