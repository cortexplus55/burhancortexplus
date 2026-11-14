import { notFound } from "next/navigation";
import { KurucuFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (14 Kasım 2026, Prompt 1): Kurucu rozetinin girişli sayfalardaki yüzleri, veritabanısız.
 * `?ekran=krediler` (kurucu kullanım görünümü), `?ekran=ayarlar` (hesap kartındaki rozet), `?ekran=pay` (abonelik
 * sayfasının kurucu kartı). Rozet her yerde Sigma görünümünde olmalı.
 */
export default async function E2eKurucuPage({ searchParams }: { searchParams: Promise<{ ekran?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const { ekran } = await searchParams;
  return <KurucuFixture screen={ekran === "ayarlar" || ekran === "pay" ? ekran : "krediler"} />;
}
