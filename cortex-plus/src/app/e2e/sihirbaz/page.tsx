import { notFound } from "next/navigation";
import { SihirbazFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (8 Kasım 2026): sınav hazırlığı kurulum sihirbazı, veritabanısız. `?adim=` taslağı o adımda
 * açar (tarayıcı kopyası; dosya ve konular örnek): subject, date, target, material, language, modality,
 * familiarity, topics, focus, plan.
 */
export default async function E2eSihirbazPage({ searchParams }: { searchParams: Promise<{ adim?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return <SihirbazFixture step={params.adim ?? "subject"} />;
}
