import { notFound } from "next/navigation";
import { CampCard } from "@/components/camp/camp-card";
import { campOffer } from "@/lib/camp/offer";

export const dynamic = "force-dynamic";

/** Kamp modu kartı fikstürü: 5 gün kalmış ücretsiz öğrenci; Plus öğrenci için kart yok. */
export default function E2eKampPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const free = campOffer({ daysLeft: 5, examPassed: false, showsUpgradeChrome: true, weeklyKurus: 34900 });
  const plus = campOffer({ daysLeft: 5, examPassed: false, showsUpgradeChrome: false, weeklyKurus: 34900 });
  return (
    <main style={{ padding: "1rem" }}>
      {free ? <CampCard offer={free} /> : null}
      <p data-testid="plus-camp">{plus ? "var" : "yok"}</p>
    </main>
  );
}
