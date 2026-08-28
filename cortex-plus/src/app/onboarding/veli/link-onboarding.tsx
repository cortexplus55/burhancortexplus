"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { ParentLinkForms } from "@/components/parity/parent-link-forms";
import { completeParentOnboardingIfLinked } from "@/app/kayit/actions";
import "@/styles/astra-marketing.css";
import "@/styles/astra-app.css";

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
      <div className="mx-auto max-w-md space-y-6 pb-16">
        <p className="text-[var(--mk-muted)]">
          Paneli açmak için davet kodu gir veya e-posta ile davet gönder.
          Öğrenci onaylayana kadar ilerleme özeti ve Plus satın alma kapalı
          kalır.
        </p>
        <ParentLinkForms onLinked={() => void finish()} />
        <p className="text-center text-sm text-[var(--mk-muted)]">
          Yanlış hesap mı?{" "}
          <Link href="/ayarlar" className="text-[var(--mk-primary)] underline">
            Ayarlar
          </Link>
        </p>
      </div>
    </AstraMarketingPage>
  );
}
