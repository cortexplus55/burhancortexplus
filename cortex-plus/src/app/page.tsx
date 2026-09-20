import {
  FaqSection,
  FeatureStrip,
  ParityMarketingPage,
  SubjectGrid,
} from "@/components/parity/marketing";
import { CinematicHero } from "@/components/marketing/cinematic-hero";
import { CinematicSocialProof } from "@/components/marketing/cinematic-social-proof";
import { CinematicGuaranteeStrip } from "@/components/marketing/cinematic-guarantee-strip";
import { CinematicPlanSlider } from "@/components/marketing/cinematic-plan-slider";
import { MistakeLoopSection } from "@/components/marketing/mistake-loop-section";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import { FilmClimaxCta } from "@/components/marketing/film-climax-cta";

export default function HomePage() {
  return (
    <ParityMarketingPage variant="home">
      <CinematicHero />
      <CinematicGuaranteeStrip />
      {/* Döngü özelliklerden önce: neden işe yaradığını anlatır. */}
      <MistakeLoopSection />
      <ProductShowcase />
      <CinematicSocialProof />
      <CinematicPlanSlider />
      <FilmClimaxCta />
      <FeatureStrip />
      <SubjectGrid />
      <FaqSection />
    </ParityMarketingPage>
  );
}
