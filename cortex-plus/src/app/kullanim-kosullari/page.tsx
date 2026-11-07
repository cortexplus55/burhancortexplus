import { LegalDocument } from "@/components/layout/legal-document";
import { TERMS_SECTIONS, TERMS_VERSION } from "@/lib/legal/terms-text";

export const metadata = {
  title: "Kullanım koşulları",
  description: "Cortex Plus hizmetinin kullanım şartları.",
};

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
