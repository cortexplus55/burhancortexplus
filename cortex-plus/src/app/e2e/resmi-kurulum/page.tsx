import { notFound } from "next/navigation";
import { ResmiKurulumFixture } from "./fixture";
import { isSetupExam, isYksAlan } from "@/lib/curriculum/yks-alan";

export const dynamic = "force-dynamic";

export default async function E2eResmiKurulumPage({
  searchParams,
}: {
  searchParams: Promise<{ sinav?: string; alan?: string; konu?: string }>;
}) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const { sinav, alan, konu } = await searchParams;
  const exam = isSetupExam(sinav) ? sinav : null;
  return (
    <ResmiKurulumFixture
      exam={exam}
      alan={exam === "yks" && isYksAlan(alan) ? alan : null}
      topic={typeof konu === "string" && konu.trim() ? konu.trim() : null}
    />
  );
}
