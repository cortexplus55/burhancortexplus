import { notFound } from "next/navigation";
import { UniteKontrolFixture } from "./fixture";

export const dynamic = "force-dynamic";

export default function E2eUniteKontrolPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return <UniteKontrolFixture />;
}
