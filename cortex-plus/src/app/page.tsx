import {
  AstraFaqSection,
  AstraFeatureStrip,
  AstraMarketingHero,
  AstraMarketingPage,
  AstraSubjectGrid,
} from "@/components/parity/astra-marketing";

export default function HomePage() {
  return (
    <AstraMarketingPage>
      <AstraMarketingHero />
      <AstraFeatureStrip />
      <AstraSubjectGrid />
      <AstraFaqSection />
    </AstraMarketingPage>
  );
}
