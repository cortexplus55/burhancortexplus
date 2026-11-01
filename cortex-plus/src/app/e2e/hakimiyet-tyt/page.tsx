import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { TytFixture } from "./fixture";
import { tytScenario } from "./scenario";

export const dynamic = "force-dynamic";

export default async function E2eHakimiyetTytPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const answered = (await cookies()).get("e2e_tyt")?.value === "answered";
  return <TytFixture units={tytScenario(answered)} />;
}
