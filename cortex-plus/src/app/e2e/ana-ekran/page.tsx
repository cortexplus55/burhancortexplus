import { notFound } from "next/navigation";
import { AnaEkranFixture } from "./fixture";
import { fixturePlan } from "./plan";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (8 Kasım 2026): öğrencinin ana ekranı (`/ogretmen`), veritabanısız. Boş ekran ve sohbet hâli,
 * ücretsiz ve Plus hesap; telefonda, tablette ve masaüstünde üst üste binme ölçümü için.
 * `?hak=taze|kullanildi|bitti` ücretsiz hak durumu, `?kota=90|100` Plus kotası (Faz 3B).
 * `?durum=sohbet` sohbet hâli, `?plan=plus|hafta|sigma|kurucu` plan (profil kimliği, 13 Kasım 2026), `?hazirlik=1` hazırlığı olan öğrenci (`=yeni`: hiç adımı bitmemiş).
 */
export default async function E2eAnaEkranPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; plan?: string; hazirlik?: string; konu?: string; hak?: string; kota?: string }>;
}) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return (
    <AnaEkranFixture
      conversation={params.durum === "sohbet" || params.durum === "cevapsiz" || params.durum === "ogretim"}
      teaching={params.durum === "ogretim"}
      unanswered={params.durum === "cevapsiz"}
      plus={fixturePlan(params.plan) !== "free"}
      planKind={fixturePlan(params.plan)}
      hasPrep={params.hazirlik === "1" || params.hazirlik === "yeni"}
      freshPrep={params.hazirlik === "yeni"}
      manyTopics={params.konu === "cok"}
      rights={params.hak === "taze" || params.hak === "kullanildi" || params.hak === "bitti" ? params.hak : undefined}
      quota={params.kota === "90" ? 90 : params.kota === "100" ? 100 : undefined}
    />
  );
}
