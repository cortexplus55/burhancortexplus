/**
 * Ders ve rehber sayfalarının adresleri ve kısa adları (27 Kasım 2026, SEO ve GEO). Bağımlılıksız: altbilgi, mobil
 * uygulama yönlendirmesi ve bekçiler bu küçük listeyi okur; sayfaların metni `subject-hubs.ts` ve `guides.ts`'te.
 */
export const SUBJECT_HUB_LINKS = [
  { id: "matematik", path: "/ders/matematik", name: "Matematik" },
  { id: "kimya", path: "/ders/kimya", name: "Kimya" },
  { id: "fizik", path: "/ders/fizik", name: "Fizik" },
  { id: "biyoloji", path: "/ders/biyoloji", name: "Biyoloji" },
  { id: "turkce", path: "/ders/turkce", name: "Türkçe" },
  { id: "tarih", path: "/ders/tarih", name: "Tarih" },
  { id: "cografya", path: "/ders/cografya", name: "Coğrafya" },
  { id: "ingilizce", path: "/ders/ingilizce", name: "İngilizce" },
] as const;

export type SubjectHubId = (typeof SUBJECT_HUB_LINKS)[number]["id"];

export const GUIDE_LINKS = [
  { slug: "ders-notundan-calisma-programi-nasil-yapilir", name: "Ders notundan çalışma programı nasıl yapılır?" },
  { slug: "tyt-matematik-netleri-nasil-artar", name: "TYT matematik netleri nasıl artar?" },
  { slug: "ayt-kimya-calisma-sirasi-ve-konulari", name: "AYT kimya çalışma sırası ve konuları" },
  { slug: "vize-haftasi-slayt-ozetleme-taktikleri", name: "Vize haftası slayt özetleme taktikleri" },
  { slug: "gece-ders-calisirken-takilan-soru-cozumu", name: "Gece ders çalışırken takılan soru nasıl çözülür?" },
  { slug: "sinav-hazirlik-uygulamasi-nasil-secilir", name: "Sınav hazırlık uygulaması nasıl seçilir?" },
] as const;

export type GuideSlug = (typeof GUIDE_LINKS)[number]["slug"];

export const guidePath = (slug: GuideSlug) => `/rehber/${slug}` as const;

/** Dizin sayfaları. */
export const SUBJECT_INDEX_PATH = "/ders";
export const GUIDE_INDEX_PATH = "/rehber";
