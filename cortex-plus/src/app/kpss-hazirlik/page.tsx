import { ExamLandingPage } from "@/components/marketing/exam-landing-page";
import { EXAM_LANDINGS } from "@/lib/marketing/exam-landings";
import { pageMetadata } from "@/lib/seo/page-metadata";

// Sınav açılış sayfası (27 Kasım 2026, SEO ve GEO). Metin `exam-landings.ts`'te; fiyatlar ana sayfayla aynı tazelikte.
const landing = EXAM_LANDINGS.kpss;

export const metadata = pageMetadata({
  title: landing.metaTitle,
  description: landing.metaDescription,
  path: landing.path,
});

export const revalidate = 300;

export default function Page() {
  return <ExamLandingPage id="kpss" />;
}
