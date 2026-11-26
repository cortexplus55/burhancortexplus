import { LegalDocument } from "@/components/layout/legal-document";
import { KVKK_SECTIONS, KVKK_SUMMARY, KVKK_VERSION_LABEL } from "@/lib/legal/kvkk-text";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata = pageMetadata({
  title: "KVKK aydınlatma metni",
  description:
    "6698 sayılı KVKK kapsamında Cortex Plus'ın işlediği kişisel veriler, işleme amaçları, aktarıldığı yerler ve başvuru hakların.",
  path: "/kvkk",
});

/**
 * Metin `src/lib/legal/kvkk-text.ts`'te: kayıttaki okuma penceresi de aynı metni gösterir, iki yer ayrışmaz.
 */
export default function KvkkPage() {
  return (
    <LegalDocument
      title="KVKK aydınlatma metni"
      description="6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanmıştır."
      version={KVKK_VERSION_LABEL}
      summary={KVKK_SUMMARY}
      sections={KVKK_SECTIONS}
    />
  );
}
