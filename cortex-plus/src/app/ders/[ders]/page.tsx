import { notFound } from "next/navigation";
import { SubjectHubPage } from "@/components/marketing/subject-hub-page";
import { SUBJECT_HUB_LINKS, type SubjectHubId } from "@/lib/marketing/content-hub-links";
import { SUBJECT_HUBS } from "@/lib/marketing/subject-hubs";
import { pageMetadata } from "@/lib/seo/page-metadata";

// Ders açılış sayfaları (27 Kasım 2026, SEO ve GEO): yalnız tanımlı sekiz ders; başka adres 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return SUBJECT_HUB_LINKS.map((link) => ({ ders: link.id }));
}

function hubOf(slug: string) {
  return SUBJECT_HUB_LINKS.some((link) => link.id === slug) ? SUBJECT_HUBS[slug as SubjectHubId] : null;
}

export async function generateMetadata({ params }: { params: Promise<{ ders: string }> }) {
  const hub = hubOf((await params).ders);
  if (!hub) return {};
  return pageMetadata({ title: hub.metaTitle, description: hub.metaDescription, path: hub.path });
}

export default async function Page({ params }: { params: Promise<{ ders: string }> }) {
  const hub = hubOf((await params).ders);
  if (!hub) notFound();
  return <SubjectHubPage id={hub.id} />;
}
