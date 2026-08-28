import { redirect } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { getParentLinkStatus } from "@/lib/parent/link-status";
import { ParentLinkOnboarding } from "./link-onboarding";

export const metadata = { title: "Çocuğunu bağla" };

export default async function VeliOnboardingPage() {
  const { supabase, user } = await requireParent();
  const status = await getParentLinkStatus(supabase, user.id);

  if (status.hasOpenLink) {
    await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id);
    redirect("/veli");
  }

  return <ParentLinkOnboarding />;
}
