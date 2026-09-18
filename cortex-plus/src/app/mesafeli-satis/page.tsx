import { LegalDocument } from "@/components/layout/legal-document";
import { SellerWarning } from "@/components/layout/seller-warning";
import { DISTANCE_SALES_SECTIONS } from "@/lib/legal/texts";

export const metadata = {
  title: "Mesafeli satış sözleşmesi",
  description: "Cortex Plus hizmetinin satışına ilişkin sözleşme.",
};

export default function MesafeliSatisPage() {
  return (
    <>
      <SellerWarning />
      <LegalDocument
        title="Mesafeli satış sözleşmesi"
        description="Cortex Plus hizmetinin satışına ilişkin sözleşme."
        sections={DISTANCE_SALES_SECTIONS}
      />
    </>
  );
}
