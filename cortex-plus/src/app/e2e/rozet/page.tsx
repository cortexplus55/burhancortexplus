import { notFound } from "next/navigation";
import { RozetFixture } from "./fixture";

export const dynamic = "force-dynamic";

export default function E2eRozetPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return <RozetFixture />;
}
