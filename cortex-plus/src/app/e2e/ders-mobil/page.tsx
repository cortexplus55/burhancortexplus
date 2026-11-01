import { notFound } from "next/navigation";
import { DersMobilFixture } from "./fixture";

export const dynamic = "force-dynamic";

/** Mobil yerleşim fikstürü (1 Kasım 2026): akış şeması, tablo ve kavram kartları tek ekranda. */
export default function E2eDersMobilPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return <DersMobilFixture />;
}
