"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { createClient } from "@/lib/supabase/client";
import { homePathForRole } from "@/lib/parity/signup";
import { toast } from "sonner";
import "@/styles/astra-marketing.css";

export default function VeliOnboardingPage() {
  const router = useRouter();

  async function finish() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/giris");
      return;
    }
    await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id);
    toast.success("Veli paneline hoş geldin!");
    router.push(homePathForRole("parent"));
    router.refresh();
  }

  return (
    <AstraMarketingPage variant="auth" title="Veli hesabın">
      <div className="mx-auto max-w-md space-y-6 pb-16">
        <p className="text-[var(--mk-muted)]">
          Çocuğunu davet kodu veya e-posta ile bağlayabilirsin. Bağlantı
          olmadan da Plus aboneliğini yönetebilirsin.
        </p>
        <div className="mk-card space-y-4 p-6">
          <Button
            type="button"
            className="mk-btn-primary w-full rounded-full py-3"
            onClick={finish}
          >
            Veli paneline git
          </Button>
        </div>
      </div>
    </AstraMarketingPage>
  );
}
