import { LegalDocument } from "@/components/layout/legal-document";
import { KVKK_SECTIONS, KVKK_SUMMARY, KVKK_VERSION } from "@/lib/legal/kvkk-text";

export const metadata = {
  title: "KVKK aydınlatma metni",
  description:
    "6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında aydınlatma metni.",
};

/**
 * Metin `src/lib/legal/kvkk-text.ts`'te: kayıttaki okuma penceresi de aynı metni gösterir, iki yer ayrışmaz.
 */
export default function KvkkPage() {
  return (
    <LegalDocument
      title="KVKK aydınlatma metni"
      description="6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanmıştır."
      version={KVKK_VERSION}
      summary={KVKK_SUMMARY}
      sections={KVKK_SECTIONS}
    />
  );
}
