import {
  OriginFaqSection,
  OriginFeatureStrip,
  OriginMarketingHero,
  OriginMarketingPage,
  OriginStatBand,
  OriginSubjectGrid,
} from "@/components/marketing/origin-marketing";

export default function HomePage() {
  return (
    <OriginMarketingPage>
      <OriginMarketingHero />
      <OriginFeatureStrip />
      <OriginStatBand />
      <OriginSubjectGrid />
      <OriginFaqSection />
    </OriginMarketingPage>
  );
}
