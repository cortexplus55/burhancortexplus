import { notFound } from "next/navigation";
import { KurulumFixture } from "./fixture";
import "@/styles/exam-create-wizard.css";

export const dynamic = "force-dynamic";

/** Uçtan uca fikstür (8 Kasım 2026): tarih adımı, zorluk seçimi ve eğitmen kutusu, veritabanısız. */
export default function E2eKurulumPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return <KurulumFixture />;
}
