import { notFound } from "next/navigation";
import { SohbetGecmisiFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (21 Kasım 2026, Faz 11): öğretmen ana ekranının geçmiş paneli, veritabanısız.
 * `?durum=sohbet` açık sohbet (geniş ekranda yan panel), `?durum=hazirlik` hazırlığı olan ana ekran, `?durum=liste` Geçmiş konuşmalar sayfasının gruplu hâli; verilmezse
 * boş ana ekran.
 */
export default async function E2eSohbetGecmisiPage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const { durum } = await searchParams;
  const state = durum === "sohbet" || durum === "hazirlik" || durum === "liste" ? durum : "bos";
  return <SohbetGecmisiFixture state={state} />;
}
