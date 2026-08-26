import {
  AstraFaqSection,
  AstraFeatureStrip,
  AstraMarketingPage,
  AstraSubjectGrid,
} from "@/components/parity/astra-marketing";
import { CinematicHero } from "@/components/marketing/cinematic-hero";
import { CinematicSocialProof } from "@/components/marketing/cinematic-social-proof";
import "@/styles/cinematic-home.css";

export default function HomePage() {
  return (
    <AstraMarketingPage className="cinematic-home">
      <CinematicHero />
      <CinematicSocialProof />
      <AstraFeatureStrip />
      <AstraSubjectGrid />
      <AstraFaqSection />
    </AstraMarketingPage>
  );
}
