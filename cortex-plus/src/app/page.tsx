import {
  AstraFaqSection,
  AstraFeatureStrip,
  AstraMarketingPage,
  AstraSubjectGrid,
} from "@/components/parity/astra-marketing";
import { CinematicHero } from "@/components/marketing/cinematic-hero";
import { CinematicSocialProof } from "@/components/marketing/cinematic-social-proof";

export default function HomePage() {
  return (
    <AstraMarketingPage variant="home">
      <CinematicHero />
      <CinematicSocialProof />
      <AstraFeatureStrip />
      <AstraSubjectGrid />
      <AstraFaqSection />
    </AstraMarketingPage>
  );
}
