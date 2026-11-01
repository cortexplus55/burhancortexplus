import { notFound } from "next/navigation";
import { HizliTaramaFixture } from "./fixture";

export const dynamic = "force-dynamic";

export default async function E2eHizliTaramaPage({ searchParams }: { searchParams: Promise<{ bos?: string; oturum?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const { bos, oturum } = await searchParams;
  return <HizliTaramaFixture empty={bos === "1"} signedIn={oturum === "1"} />;
}
