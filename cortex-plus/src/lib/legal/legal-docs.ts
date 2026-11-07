import { KVKK_SECTIONS, KVKK_SUMMARY } from "@/lib/legal/kvkk-text";
import { TERMS_SECTIONS } from "@/lib/legal/terms-text";
import { DISTANCE_SALES_SECTIONS, PRE_INFO_SECTIONS } from "@/lib/legal/texts";
import { LEGAL_VERSIONS, SALES_DOCS } from "@/lib/legal/versions";
import type { LegalSection } from "@/lib/legal/legal-types";

/**
 * Okuma penceresinde açılabilen metinler: sayfa (`/kvkk`, `/kullanim-kosullari`) ve pencere aynı veriyi çizer, iki
 * metin birbirinden ayrışamaz.
 */
export type ReadableDocId = "kvkk_aydinlatma" | "kullanim_kosullari" | "satis_sozlesmeleri";

export type ReadableDoc = {
  id: ReadableDocId;
  /** Pencerenin başlığı ve kutudaki bağlantı adı. */
  title: string;
  href: string;
  version: string;
  summary?: string[];
  parts: { title?: string; href?: string; sections: LegalSection[] }[];
};

export const READABLE_DOCS: Record<ReadableDocId, ReadableDoc> = {
  kvkk_aydinlatma: {
    id: "kvkk_aydinlatma",
    title: "KVKK Aydınlatma Metni",
    href: "/kvkk",
    version: LEGAL_VERSIONS.kvkk_aydinlatma,
    summary: KVKK_SUMMARY,
    parts: [{ sections: KVKK_SECTIONS }],
  },
  kullanim_kosullari: {
    id: "kullanim_kosullari",
    title: "Kullanım Koşulları",
    href: "/kullanim-kosullari",
    version: LEGAL_VERSIONS.kullanim_kosullari,
    parts: [{ sections: TERMS_SECTIONS }],
  },
  satis_sozlesmeleri: {
    id: "satis_sozlesmeleri",
    title: "Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi",
    href: "/mesafeli-satis",
    version: SALES_DOCS.version,
    parts: [
      { title: "Ön Bilgilendirme Formu", href: "/on-bilgilendirme", sections: PRE_INFO_SECTIONS },
      { title: "Mesafeli Satış Sözleşmesi", href: "/mesafeli-satis", sections: DISTANCE_SALES_SECTIONS },
    ],
  },
};
