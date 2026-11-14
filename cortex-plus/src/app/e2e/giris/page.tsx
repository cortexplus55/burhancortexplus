import { notFound } from "next/navigation";
import GirisPage from "@/app/giris/giris-inner";
import { SignupWizard } from "@/app/kayit/signup-wizard";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-giris.css";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (Faz 12B): giriş ve kayıt formu, `?ui=v2` ile `ui.v2.giris` sarmalayıcısıyla. Gerçek /giris ve
 * /kayit durağan (bayrak yerelde yalnız `UI_V2` ortam değişkeniyle açılır); yeni görünüm burada sınanır.
 * `?sayfa=kayit` kayıt sihirbazını çizer.
 */
export default async function E2eGirisPage({ searchParams }: { searchParams: Promise<{ ui?: string; sayfa?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return <UiScope keys={params.ui === "v2" ? ["giris"] : []}>{params.sayfa === "kayit" ? <SignupWizard /> : <GirisPage />}</UiScope>;
}
