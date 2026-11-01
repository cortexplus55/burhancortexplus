import { notFound } from "next/navigation";
import { ResmiKurulumFixture } from "./fixture";
import { isSetupExam } from "@/lib/curriculum/yks-alan";

export const dynamic = "force-dynamic";

export default async function E2eResmiKurulumPage({ searchParams }: { searchParams: Promise<{ sinav?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const { sinav } = await searchParams;
  return <ResmiKurulumFixture exam={isSetupExam(sinav) ? sinav : null} />;
}
