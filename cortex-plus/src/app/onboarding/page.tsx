"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { createClient } from "@/lib/supabase/client";
import { homePathForRole } from "@/lib/parity/signup";
import { toast } from "sonner";
import "@/styles/astra-marketing.css";

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
    <AstraMarketingPage title="Hoş geldin">
      <div className="mx-auto max-w-md space-y-6 pb-16">
        <p className="text-[var(--mk-muted)]">
          Birkaç soruyla deneyimini kişiselleştirelim.
        </p>
        <div className="mk-card space-y-6 p-6">
          <div className="space-y-2">
            <Label>Hangi okula gidiyorsun?</Label>
            <Select value={grade} onValueChange={(v) => setGrade(v ?? "")}>
              <SelectTrigger className="border-[var(--mk-border)] bg-[#0c0c0c]">
                <SelectValue placeholder="Sınıf / seviye seç" />
              </SelectTrigger>
              <SelectContent>
                {["9", "10", "11", "12", "Mezun"].map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}. sınıf
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Odak ders</Label>
            <Select value={subject} onValueChange={(v) => setSubject(v ?? "")}>
              <SelectTrigger className="border-[var(--mk-border)] bg-[#0c0c0c]">
                <SelectValue placeholder="Ders seç" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Matematik",
                  "Fizik",
                  "Kimya",
                  "Biyoloji",
                  "Türkçe",
                  "İngilizce",
                ].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Hedefin</Label>
            <Select value={goal} onValueChange={(v) => setGoal(v ?? "")}>
              <SelectTrigger className="border-[var(--mk-border)] bg-[#0c0c0c]">
                <SelectValue placeholder="Hedef seç" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YKS hazırlık">YKS hazırlık</SelectItem>
                <SelectItem value="Okul sınavları">Okul sınavları</SelectItem>
                <SelectItem value="Konu pekiştirme">Konu pekiştirme</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            className="mk-btn-primary w-full rounded-full py-3"
            onClick={finish}
            disabled={!grade}
          >
            Başla
          </Button>
        </div>
      </div>
    </AstraMarketingPage>
  );
}
