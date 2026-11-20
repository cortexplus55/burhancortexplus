import { notFound } from "next/navigation";
import { UygulamaKurFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (20 Kasım 2026, Faz 8): "Telefonuna Uygulama Gibi Ekle" kartı, veritabanısız. `?yer=sonuc` ders
 * sonucu (kart akışta), yoksa hazırlık sayfası (kart alt çubuğun ve "Devam et" kartının üstünde).
 */
export default async function E2eUygulamaKurPage({ searchParams }: { searchParams: Promise<{ yer?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return <UygulamaKurFixture place={params.yer === "sonuc" ? "sonuc" : "hazirlik"} />;
}
