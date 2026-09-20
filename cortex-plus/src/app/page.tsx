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
import { FilmScrollStory } from "@/components/marketing/film-scroll-story";
import { FilmClimaxCta } from "@/components/marketing/film-climax-cta";

export default function HomePage() {
  return (
    <ParityMarketingPage variant="home">
      <CinematicHero />
      <CinematicGuaranteeStrip />
      <FilmScrollStory />
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
