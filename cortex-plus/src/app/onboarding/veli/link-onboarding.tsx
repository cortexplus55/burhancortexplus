"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { ParentLinkForms } from "@/components/parity/parent-link-forms";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { completeParentOnboardingIfLinked } from "@/app/kayit/actions";
import "@/styles/astra-marketing.css";
import "@/styles/astra-app.css";
import "@/styles/signup-wizard.css";

export function ParentLinkOnboarding() {
  const router = useRouter();

  async function finish() {
    const result = await completeParentOnboardingIfLinked();
    if (!result.ok) {
      toast.error(result.error ?? "Önce çocuğunu bağla.");
      return;
    }
    toast.success("İstek gönderildi. Onay gelince raporlar açılır.");
    router.push("/veli");
    router.refresh();
  }

  return (
    <AstraMarketingPage variant="auth" title="Çocuğunu bağla">
      <OnboardingShell step={1} total={1}>
        <h2 className="signup-step-title">Bağlantı kur</h2>
        <p className="mt-2 text-sm text-[var(--mk-muted)]">
          Paneli açmak için davet kodu gir veya e-posta ile davet gönder.
          Öğrenci onaylayana kadar ilerleme özeti ve Plus satın alma kapalı
          kalır.
        </p>
        <div className="mk-card mt-6 p-5">
          <ParentLinkForms onLinked={() => void finish()} />
        </div>
        <p className="mt-6 text-center text-sm text-[var(--mk-muted)]">
          Yanlış hesap mı?{" "}
          <Link href="/ayarlar" className="text-[var(--mk-primary)] underline">
            Ayarlar
          </Link>
        </p>
      </OnboardingShell>
    </AstraMarketingPage>
  );
}
