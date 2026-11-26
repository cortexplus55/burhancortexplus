import { LegalDocument } from "@/components/layout/legal-document";
import { TERMS_SECTIONS, TERMS_VERSION } from "@/lib/legal/terms-text";
import { pageMetadata } from "@/lib/seo/page-metadata";

export const metadata = pageMetadata({
  title: "Kullanım koşulları",
  description:
    "Cortex Plus'ı kullanırken geçerli kurallar: hesap, ücretsiz ve ücretli kullanım, yapay zekâ içerikleri ve mobil uygulamada mağaza aboneliği.",
  path: "/kullanim-kosullari",
});

/** Metin `src/lib/legal/terms-text.ts`'te: kayıttaki okuma penceresi de aynı metni gösterir. */
export default function KullanimKosullariPage() {
  return (
    <LegalDocument
      title="Kullanım koşulları"
      description="Cortex Plus'ı kullanarak aşağıdaki koşulları kabul etmiş olursun."
      version={TERMS_VERSION}
      sections={TERMS_SECTIONS}
    />
  );
}
