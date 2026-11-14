import { notFound } from "next/navigation";
import { StudyoFixture } from "./fixture";
import "@/styles/ui-v2-studyo.css";

export const dynamic = "force-dynamic";

/** Uçtan uca fikstür (8 Kasım 2026): Çalışma Stüdyosu sekmesi, veritabanısız. `?plan=plus` Plus hesap; `?ui=v2` Faz 8 görünümü. */
export default async function E2eStudyoPage({ searchParams }: { searchParams: Promise<{ plan?: string; ui?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  return <StudyoFixture plus={params.plan === "plus"} v2={params.ui === "v2"} />;
}
