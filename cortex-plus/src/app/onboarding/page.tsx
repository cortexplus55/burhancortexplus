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
import {
  GOAL_OPTIONS,
  GRADE_OPTIONS,
  SUBJECT_OPTIONS,
  TUTOR_STYLE_OPTIONS,
  homePathForRole,
} from "@/lib/parity/signup";
import { DEFAULT_TUTOR_STYLE, type TutorStyle } from "@/lib/learning/tutor-style";
import { toast } from "sonner";
import "@/styles/astra-marketing.css";
import "@/styles/signup-wizard.css";

export default function OnboardingPage() {
  const router = useRouter();
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [tutorStyle, setTutorStyle] = useState<TutorStyle>(DEFAULT_TUTOR_STYLE);

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
        tutor_style: tutorStyle,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (goal) {
      const { data: goals } = await supabase
        .from("learning_goals")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      if (!goals?.length) {
        await supabase.from("learning_goals").insert({
          user_id: user.id,
          goal_text: goal,
        });
      }
    }
    toast.success("Profilin hazır!");
    router.push(homePathForRole(existing?.primary_role));
  }

  return (
    <AstraMarketingPage variant="auth" title="Hoş geldin">
      <div className="signup-wizard mx-auto max-w-md space-y-6 pb-16">
        <p className="text-[var(--mk-muted)]">
          Kayıt sihirbazını tamamlayamadıysan birkaç soruyla deneyimini
          kişiselleştirelim.
        </p>
        <div className="mk-card space-y-6 p-6">
          <div className="space-y-2">
            <Label>Hangi sınıftasın?</Label>
            <Select value={grade} onValueChange={(v) => setGrade(v ?? "")}>
              <SelectTrigger className="border-[var(--mk-border)] bg-[#0c0c0c]">
                <SelectValue placeholder="Sınıf seç" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_OPTIONS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
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
                {SUBJECT_OPTIONS.map((s) => (
                  <SelectItem key={s.label} value={s.label}>
                    {s.emoji} {s.label}
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
                {GOAL_OPTIONS.map((g) => (
                  <SelectItem key={g.label} value={g.label}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>AI öğretmen stili</Label>
            <Select
              value={tutorStyle}
              onValueChange={(v) =>
                setTutorStyle((v as TutorStyle) ?? DEFAULT_TUTOR_STYLE)
              }
            >
              <SelectTrigger className="border-[var(--mk-border)] bg-[#0c0c0c]">
                <SelectValue placeholder="Stil seç" />
              </SelectTrigger>
              <SelectContent>
                {TUTOR_STYLE_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.title}
                  </SelectItem>
                ))}
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
