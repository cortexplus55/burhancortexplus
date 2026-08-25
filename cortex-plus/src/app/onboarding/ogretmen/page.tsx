"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { createClient } from "@/lib/supabase/client";
import { homePathForRole } from "@/lib/parity/signup";
import { toast } from "sonner";
import { useState } from "react";
import "@/styles/astra-marketing.css";

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
    <AstraMarketingPage title="İlk sınıfın">
      <div className="mx-auto max-w-md space-y-6 pb-16">
        <p className="text-[var(--mk-muted)]">
          Kayıt sırasında sınıf oluşturmadıysan burada ilk sınıfını
          tanımlayabilirsin.
        </p>
        <div className="mk-card space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="class">Sınıf adı</Label>
            <Input
              id="class"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="Örn. 11-A Matematik"
              className="border-[var(--mk-border)] bg-[#0c0c0c]"
            />
          </div>
          <Button
            type="button"
            className="mk-btn-primary w-full rounded-full py-3"
            onClick={() => finish(false)}
          >
            Sınıfı oluştur ve devam et
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-[var(--mk-muted)]"
            onClick={() => finish(true)}
          >
            Sonra oluşturacağım
          </Button>
        </div>
      </div>
    </AstraMarketingPage>
  );
}
