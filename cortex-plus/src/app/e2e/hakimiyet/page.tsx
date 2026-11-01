import { notFound } from "next/navigation";
import { HakimiyetFixture } from "./fixture";

export const dynamic = "force-dynamic";

export default function E2eHakimiyetPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return <HakimiyetFixture />;
}
