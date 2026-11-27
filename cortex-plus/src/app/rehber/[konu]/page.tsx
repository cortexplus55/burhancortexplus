import { notFound } from "next/navigation";
import { GuidePage } from "@/components/marketing/guide-page";
import { GUIDE_LINKS, type GuideSlug } from "@/lib/marketing/content-hub-links";
import { GUIDES } from "@/lib/marketing/guides";
import { pageMetadata } from "@/lib/seo/page-metadata";

// Rehber sayfaları (27 Kasım 2026, SEO ve GEO): yalnız tanımlı altı rehber; başka adres 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_LINKS.map((link) => ({ konu: link.slug }));
}

function guideOf(slug: string) {
  return GUIDE_LINKS.some((link) => link.slug === slug) ? GUIDES[slug as GuideSlug] : null;
}

export async function generateMetadata({ params }: { params: Promise<{ konu: string }> }) {
  const guide = guideOf((await params).konu);
  if (!guide) return {};
  return pageMetadata({ title: guide.metaTitle, description: guide.metaDescription, path: guide.path });
}

export default async function Page({ params }: { params: Promise<{ konu: string }> }) {
  const guide = guideOf((await params).konu);
  if (!guide) notFound();
  return <GuidePage slug={guide.slug} />;
}
