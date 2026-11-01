import { notFound } from "next/navigation";
import { MufredatFixture } from "./fixture";
import "@/styles/exam-create-wizard.css";

export const dynamic = "force-dynamic";

export default function E2eMufredatPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return <MufredatFixture />;
}
