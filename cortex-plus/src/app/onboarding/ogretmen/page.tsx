"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import { OriginMarketingPage } from "@/components/marketing/origin-marketing";
import {
  OriginButton,
  OriginInput,
  OriginLabel,
} from "@/components/marketing/origin-form";
import { createClient } from "@/lib/supabase/client";
import { homePathForRole } from "@/lib/parity/signup";
import "@/styles/origin-marketing.css";

export default function OgretmenOnboardingPage() {
  const router = useRouter();
  const [className, setClassName] = useState("");

  async function finish(skipClass: boolean) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/giris");
      return;
    }

    if (!skipClass && className.trim().length >= 2) {
      const res = await fetch("/api/teacher/bootstrap-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: className.trim() }),
      });
      if (!res.ok) toast.warning("Sınıf oluşturulamadı; panelden ekleyebilirsin.");
    }

    await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id);

    toast.success("Öğretmen paneline hoş geldin!");
    router.push(homePathForRole("teacher"));
    router.refresh();
  }

  return (
    <OriginMarketingPage title="İlk sınıfın">
      <div className="mx-auto max-w-md space-y-6 pb-16">
        <p className="text-[var(--mk-muted)]">
          Kayıt sırasında sınıf oluşturmadıysan burada ilk sınıfını
          tanımlayabilirsin.
        </p>
        <div className="mk-card space-y-4 p-6">
          <div className="space-y-2">
            <OriginLabel htmlFor="class">Sınıf adı</OriginLabel>
            <OriginInput
              id="class"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="Örn. 11-A Matematik"
            />
          </div>
          <OriginButton type="button" onClick={() => finish(false)}>
            Sınıfı oluştur ve devam et
          </OriginButton>
          <button
            type="button"
            className="w-full py-2 text-sm text-[var(--mk-muted)] hover:text-[var(--color-cloud)]"
            onClick={() => finish(true)}
          >
            Sonra oluşturacağım
          </button>
        </div>
      </div>
    </OriginMarketingPage>
  );
}
