import { notFound } from "next/navigation";
import { AnaEkranFixture } from "./fixture";
import "@/styles/ui-v2-buyume.css";
import { fixturePlan } from "./plan";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (8 Kasım 2026): öğrencinin ana ekranı (`/ogretmen`), veritabanısız. Boş ekran ve sohbet hâli,
 * ücretsiz ve Plus hesap; telefonda, tablette ve masaüstünde üst üste binme ölçümü için.
 * `?hak=taze|kullanildi|bitti` ücretsiz hak durumu, `?kota=90|100` Plus kotası (Faz 3B).
 * `?durum=sohbet` sohbet hâli, `?ogretmen=v2&durum=yoklama` Faz 11 mini yoklama (formül, tablo, kod), `?plan=plus|hafta|sigma|kurucu` plan (profil kimliği, 13 Kasım 2026), `?hazirlik=1` hazırlığı olan öğrenci (`=yeni`: hiç adımı bitmemiş).
 * Öğretmen v3 (21 Kasım 2026, `?ogretmen=v2`): `&durum=karsilama` karşılama, `&durum=takip` damgalı yanıt + takip soruları,
 * `&konus=1` "Konuş" düğmesi ve sesli mod yeri.
 */
export default async function E2eAnaEkranPage({
  searchParams,
}: {
  searchParams: Promise<{ ogretmen?: string; durum?: string; plan?: string; hazirlik?: string; konu?: string; hak?: string; kota?: string; buyume?: string; konus?: string }>;
}) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return (
    <AnaEkranFixture
      welcome={params.durum === "karsilama"}
      followUps={params.durum === "takip"}
      liveTalk={params.konus === "1"}
      conversation={params.durum === "sohbet" || params.durum === "cevapsiz" || params.durum === "ogretim" || params.durum === "ozet" || params.durum === "yoklama"}
      teaching={params.durum === "ogretim"}
      teacherV2={params.ogretmen === "v2"}
      quickCheck={params.ogretmen === "v2" && params.durum === "yoklama"}
      summary={params.durum === "ozet"}
      unanswered={params.durum === "cevapsiz"}
      plus={fixturePlan(params.plan) !== "free"}
      planKind={fixturePlan(params.plan)}
      hasPrep={params.hazirlik === "1" || params.hazirlik === "yeni"}
      freshPrep={params.hazirlik === "yeni"}
      manyTopics={params.konu === "cok"}
      rights={params.hak === "taze" || params.hak === "kullanildi" || params.hak === "bitti" ? params.hak : undefined}
      quota={params.kota === "90" ? 90 : params.kota === "100" ? 100 : undefined}
      growth={params.buyume === "1"}
    />
  );
}
