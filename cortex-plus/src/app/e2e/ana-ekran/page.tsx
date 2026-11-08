import { notFound } from "next/navigation";
import { AnaEkranFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (8 Kasım 2026): öğrencinin ana ekranı (`/ogretmen`), veritabanısız. Boş ekran ve sohbet hâli,
 * ücretsiz ve Plus hesap; telefonda, tablette ve masaüstünde üst üste binme ölçümü için.
 * `?durum=sohbet` sohbet hâli, `?plan=plus` Plus hesap, `?hazirlik=1` hazırlığı olan öğrenci.
 */
export default async function E2eAnaEkranPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; plan?: string; hazirlik?: string }>;
}) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return (
    <AnaEkranFixture
      conversation={params.durum === "sohbet"}
      plus={params.plan === "plus"}
      hasPrep={params.hazirlik === "1"}
    />
  );
}
