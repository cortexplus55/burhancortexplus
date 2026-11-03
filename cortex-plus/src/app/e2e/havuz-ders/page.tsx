import { notFound } from "next/navigation";
import { HavuzDersFixture } from "./fixture";

export const dynamic = "force-dynamic";

/** Belgesiz hazırlıkta ilk ders düğümü (3 Kasım 2026): havuz dersi doğrudan açılır, kurulum kartı görünmez. */
export default async function E2eHavuzDersPage({ searchParams }: { searchParams: Promise<{ auto?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const { auto } = await searchParams;
  return <HavuzDersFixture auto={auto !== "0"} />;
}
