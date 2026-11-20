import { notFound } from "next/navigation";
import { GorselSahneFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Faz 1-B görsel sahne fikstürü: `?mod=ders` altı arketip ders ekranında; `?mod=video&sahne=0-4&arketip=…`
 * 5 sahneli akış gerçek oynatıcıda (tek sahne ya da hepsi).
 */
export default async function E2eGorselSahnePage({ searchParams }: { searchParams: Promise<{ mod?: string; sahne?: string; arketip?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return <GorselSahneFixture mod={params.mod ?? "ders"} sahne={params.sahne === undefined ? -1 : Number(params.sahne)} arketip={params.arketip ?? ""} />;
}
