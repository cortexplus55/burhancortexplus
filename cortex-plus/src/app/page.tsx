import {
  AstraFaqSection,
  AstraFeatureStrip,
  AstraMarketingPage,
  AstraSubjectGrid,
} from "@/components/parity/astra-marketing";
import { CinematicHero } from "@/components/marketing/cinematic-hero";
import { CinematicSocialProof } from "@/components/marketing/cinematic-social-proof";
import { CinematicGuaranteeStrip } from "@/components/marketing/cinematic-guarantee-strip";
import { CinematicPlanSlider } from "@/components/marketing/cinematic-plan-slider";

export default function HomePage() {
  return (
    <AstraMarketingPage variant="home">
      <CinematicHero />
      <CinematicGuaranteeStrip />
      <CinematicSocialProof />
      <CinematicPlanSlider />
      <AstraFeatureStrip />
      <AstraSubjectGrid />
      <AstraFaqSection />
    </AstraMarketingPage>
  );
}
