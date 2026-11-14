import { notFound } from "next/navigation";
import { DersMobilFixture } from "./fixture";
import "@/styles/ui-v2-ders.css";

export const dynamic = "force-dynamic";

/**
 * Mobil yerleşim fikstürü (1 Kasım 2026): akış şeması, tablo ve kavram kartları tek ekranda.
 * `?ui=v2` (Faz 4B): ders sayfasının `ui.v2.ders` açıkken yaptığı gibi sarmalayıcıyla çizer.
 */
export default async function E2eDersMobilPage({ searchParams }: { searchParams: Promise<{ ui?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return params.ui === "v2" ? (
    <div className="cx-ui-scope" data-ui="ders">
      <DersMobilFixture />
    </div>
  ) : (
    <DersMobilFixture />
  );
}
