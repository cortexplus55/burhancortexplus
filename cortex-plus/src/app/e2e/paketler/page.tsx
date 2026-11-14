import { notFound } from "next/navigation";
import { PaketlerFixture } from "./fixture";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-pay.css";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (Faz 7C): /pay'in paket kartları, veritabanısız ve ödemesiz (örnek planlar; satın alma düğmesine
 * basılmaz, PayTR çağrılmaz). `?plan=plus|week|sigma` kartı işaretler; `?ui=v2` sayfanın `ui.v2.pay` açıkken yaptığı
 * gibi sarmalar.
 */
export default async function E2ePaketlerPage({ searchParams }: { searchParams: Promise<{ ui?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return (
    <main className="cs-app mx-auto max-w-5xl px-4 py-8">
      <UiScope keys={params.ui === "v2" ? ["pay"] : []}>
        <PaketlerFixture />
      </UiScope>
    </main>
  );
}
