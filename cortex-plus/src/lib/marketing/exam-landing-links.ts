/**
 * Sınav açılış sayfalarının adresleri ve kısa adları (27 Kasım 2026, SEO). Bağımlılıksız: altbilgi, `/sinav-hazirligi`,
 * site haritası ve `/llms.txt` bu küçük listeyi okur; sayfaların metni `exam-landings.ts`'te. Sıra her yerde aynı.
 */
export const EXAM_LANDING_LINKS = [
  { id: "yks", path: "/yks-hazirlik", navLabel: "YKS hazırlık", examLabel: "YKS (TYT ve AYT)" },
  { id: "lgs", path: "/lgs-hazirlik", navLabel: "LGS hazırlık", examLabel: "LGS (8. sınıf)" },
  { id: "kpss", path: "/kpss-hazirlik", navLabel: "KPSS hazırlık", examLabel: "KPSS" },
  { id: "tus", path: "/tus-hazirlik", navLabel: "TUS hazırlık", examLabel: "TUS, DUS, ALES, vize ve final" },
] as const;

export type ExamLandingLink = (typeof EXAM_LANDING_LINKS)[number];
export type ExamLandingId = ExamLandingLink["id"];
export const EXAM_LANDING_PATHS: readonly string[] = EXAM_LANDING_LINKS.map((link) => link.path);
