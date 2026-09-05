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
import { MistakeLoopSection } from "@/components/marketing/mistake-loop-section";

export default function HomePage() {
  return (
    <AstraMarketingPage variant="home">
      <CinematicHero />
      <CinematicGuaranteeStrip />
      {/* Döngü, özellik şeridinden ÖNCE: şerit ne yapabildiğimizi sayıyor,
          döngü ise neden işe yaradığını anlatıyor. Sırası tersine dönerse
          ziyaretçi özellik listesini okuyup ayrılıyor. */}
      <MistakeLoopSection />
      <CinematicSocialProof />
      <CinematicPlanSlider />
      <AstraFeatureStrip />
      <AstraSubjectGrid />
      <AstraFaqSection />
    </AstraMarketingPage>
  );
}
