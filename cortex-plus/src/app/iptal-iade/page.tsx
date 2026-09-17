import { LegalDocument } from "@/components/layout/legal-document";
import { SellerWarning } from "@/components/layout/seller-warning";
import { CANCELLATION_SECTIONS } from "@/lib/legal/texts";

export const metadata = {
  title: "İptal ve iade koşulları",
  description: "Cayma hakkı, abonelik sonu ve kredi iadesi.",
};

export default function IptalIadePage() {
  return (
    <>
      <SellerWarning />
      <LegalDocument
        title="İptal ve iade koşulları"
        description="Cayma hakkı, abonelik sonu ve kredi iadesi."
        sections={CANCELLATION_SECTIONS}
      />
    </>
  );
}
