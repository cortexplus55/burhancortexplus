import { notFound } from "next/navigation";
import { IcEkranFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (8 Kasım 2026): iç ekranlar veritabanısız. `?ekran=radar` İlerleme'nin hazırlık beşgeni,
 * `?ekran=test` Konu Testi stüdyosu, `?ekran=defter` boş Yanlışlar Defteri, `?ekran=yol-konu` konulu çalışma yolu.
 */
export default async function E2eIcEkranPage({ searchParams }: { searchParams: Promise<{ ekran?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return <IcEkranFixture screen={params.ekran ?? "radar"} />;
}
