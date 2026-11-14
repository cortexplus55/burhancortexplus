import { notFound } from "next/navigation";
import { SihirbazFixture } from "./fixture";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-kurulum.css";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (8 Kasım 2026): sınav hazırlığı kurulum sihirbazı, veritabanısız. `?adim=` taslağı o adımda
 * açar (tarayıcı kopyası; dosya ve konular örnek): subject, date, target, material, language, modality,
 * familiarity, topics, focus, plan. `?ui=v2` (Faz 7B): kurulum sayfasının `ui.v2.kurulum` açıkken yaptığı gibi sarmalar.
 */
export default async function E2eSihirbazPage({ searchParams }: { searchParams: Promise<{ adim?: string; ui?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return (
    <UiScope keys={params.ui === "v2" ? ["kurulum"] : []}>
      <SihirbazFixture step={params.adim ?? "subject"} />
    </UiScope>
  );
}
