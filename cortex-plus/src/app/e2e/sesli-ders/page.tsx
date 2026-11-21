import { notFound } from "next/navigation";
import { SesliDersFixture } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Uçtan uca fikstür (21 Kasım 2026): sohbetin içinde canlı sesli ders, veritabanısız. `?erisim=deneme` ücretsiz
 * denemenin 1 dakikası, `?yer=alt` çubuk ekranın altında (telefon), `?tema=acik`, `?baslat=0` kendiliğinden bağlanmaz.
 * Uç yerelde gerçek OpenAI çağrısı yapan fikstür ucudur (`/api/e2e/realtime-session/*`, üretimde 404); e2e testleri
 * ağı ve WebRTC'yi taklit eder.
 */
export default async function E2eSesliDersPage({
  searchParams,
}: {
  searchParams: Promise<{ erisim?: string; yer?: string; tema?: string; baslat?: string; ses?: string }>;
}) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  const access = params.erisim === "deneme" ? "trial" : "paid";
  // Ses karşılaştırması (yalnız yerel canlı deneme): ?ses=cedar
  const voice = params.ses && /^[a-z]{3,12}$/.test(params.ses) ? `-${params.ses}` : "";
  return (
    <SesliDersFixture
      endpoint={`/api/e2e/realtime-session/${access}${voice}`}
      dock={params.yer === "alt" ? "bottom" : "inline"}
      theme={params.tema === "acik" ? "light" : "dark"}
      autoStart={params.baslat !== "0"}
    />
  );
}
