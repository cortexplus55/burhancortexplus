"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OriginMarketingPage } from "@/components/marketing/origin-marketing";
import {
  OriginButton,
  OriginLabel,
  originSelectTriggerClass,
} from "@/components/marketing/origin-form";
import {
  OriginSelectContent,
  OriginSelectItem,
} from "@/components/marketing/origin-form-controls";
import { createClient } from "@/lib/supabase/client";
import { homePathForRole } from "@/lib/parity/signup";
import { toast } from "sonner";
import "@/styles/origin-marketing.css";

export default function OnboardingPage() {
  const router = useRouter();
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");

  async function finish() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/giris");
      return;
    }
    const { data: existing } = await supabase
      .from("profiles")
      .select("primary_role")
      .eq("id", user.id)
      .maybeSingle();

    await supabase
      .from("profiles")
      .update({
        grade_level: grade,
        focus_subject: subject || null,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (goal) {
      await supabase.from("learning_goals").insert({
        user_id: user.id,
        goal_text: goal,
      });
    }
    toast.success("Profilin hazır!");
    router.push(homePathForRole(existing?.primary_role));
  }

  return (
    <OriginMarketingPage title="Hoş geldin">
      <div className="mx-auto max-w-md space-y-6 pb-16">
        <p className="text-[var(--mk-muted)]">
          Birkaç soruyla deneyimini kişiselleştirelim.
        </p>
        <div className="mk-card space-y-6 p-6">
          <div className="space-y-2">
            <OriginLabel>Hangi okula gidiyorsun?</OriginLabel>
            <Select value={grade} onValueChange={(v) => setGrade(v ?? "")}>
              <SelectTrigger className={originSelectTriggerClass}>
                <SelectValue placeholder="Sınıf / seviye seç" />
              </SelectTrigger>
              <OriginSelectContent>
                {["9", "10", "11", "12", "Mezun"].map((g) => (
                  <OriginSelectItem key={g} value={g}>
                    {g}. sınıf
                  </OriginSelectItem>
                ))}
              </OriginSelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <OriginLabel>Odak ders</OriginLabel>
            <Select value={subject} onValueChange={(v) => setSubject(v ?? "")}>
              <SelectTrigger className={originSelectTriggerClass}>
                <SelectValue placeholder="Ders seç" />
              </SelectTrigger>
              <OriginSelectContent>
                {[
                  "Matematik",
                  "Fizik",
                  "Kimya",
                  "Biyoloji",
                  "Türkçe",
                  "İngilizce",
                ].map((s) => (
                  <OriginSelectItem key={s} value={s}>
                    {s}
                  </OriginSelectItem>
                ))}
              </OriginSelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <OriginLabel>Hedefin</OriginLabel>
            <Select value={goal} onValueChange={(v) => setGoal(v ?? "")}>
              <SelectTrigger className={originSelectTriggerClass}>
                <SelectValue placeholder="Hedef seç" />
              </SelectTrigger>
              <OriginSelectContent>
                <OriginSelectItem value="YKS hazırlık">YKS hazırlık</OriginSelectItem>
                <OriginSelectItem value="Okul sınavları">Okul sınavları</OriginSelectItem>
                <OriginSelectItem value="Konu pekiştirme">Konu pekiştirme</OriginSelectItem>
              </OriginSelectContent>
            </Select>
          </div>
          <OriginButton type="button" onClick={finish} disabled={!grade}>
            Başla
          </OriginButton>
        </div>
      </div>
    </OriginMarketingPage>
  );
}
