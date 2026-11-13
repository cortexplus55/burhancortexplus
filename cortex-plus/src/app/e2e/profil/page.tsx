import { notFound } from "next/navigation";
import { fixturePlan } from "../ana-ekran/plan";
import { ProfilFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (13 Kasım 2026, Faz 2): /profil sayfası (kapsülün açtığı panelle aynı içerik), veritabanısız.
 * `?plan=plus|hafta|sigma|kurucu`, yoksa ücretsiz.
 */
export default async function E2eProfilPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return <ProfilFixture plan={fixturePlan(params.plan)} />;
}
