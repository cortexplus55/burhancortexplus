import { LegalDocument } from "@/components/layout/legal-document";
import { SellerWarning } from "@/components/layout/seller-warning";
import { DELIVERY_SECTIONS } from "@/lib/legal/texts";

export const metadata = {
  title: "Teslimat ve hizmetin sunumu",
  description: "Dijital hizmet nasıl ve ne zaman açılır.",
};

export default function TeslimatPage() {
  return (
    <>
      <SellerWarning />
      <LegalDocument
        title="Teslimat ve hizmetin sunumu"
        description="Dijital hizmet nasıl ve ne zaman açılır."
        sections={DELIVERY_SECTIONS}
      />
    </>
  );
}
