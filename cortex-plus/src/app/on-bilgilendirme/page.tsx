import { LegalDocument } from "@/components/layout/legal-document";
import { SellerWarning } from "@/components/layout/seller-warning";
import { PRE_INFO_SECTIONS } from "@/lib/legal/texts";

export const metadata = {
  title: "Ön bilgilendirme formu",
  description: "Satın almadan önce bilmeniz gerekenler.",
};

export default function OnBilgilendirmePage() {
  return (
    <>
      <SellerWarning />
      <LegalDocument
        title="Ön bilgilendirme formu"
        description="Satın almadan önce bilmeniz gerekenler."
        sections={PRE_INFO_SECTIONS}
      />
    </>
  );
}
