"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  OnboardingChoice,
  OnboardingContinue,
  OnboardingShell,
} from "@/components/layout/onboarding-shell";
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

const STEPS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [tutorStyle, setTutorStyle] = useState<TutorStyle>(DEFAULT_TUTOR_STYLE);
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    try {
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

      /*
        Kaydın başarısını kontrol etmek zorundayız.

        `onboarding_completed_at` boş kalırsa ara katman kullanıcıyı buraya
        geri gönderiyor. Eskiden sonuç bakılmadan "Profilin hazır!" deniyor ve
        yönlendiriliyordu: kayıt başarısızsa öğrenci aynı ekrana düşüyor, üstelik
        az önce "hazır" yazısını okumuş oluyordu. Bir kez yalan söyleyen ekrana
        bir daha inanılmıyor.
      */
      const { error } = await supabase
        .from("profiles")
        .update({
          grade_level: grade,
          focus_subject: subject || null,
          tutor_style: tutorStyle,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) {
        toast.error("Kaydedilemedi", {
          description: "Bağlantını kontrol edip tekrar dene.",
        });
        return;
      }

      // Hedef ikincil: kaydedilemezse akışı durdurmuyoruz, profil zaten hazır.
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <AstraMarketingPage variant="auth" title="Hoş geldin">
      <OnboardingShell
        step={step}
        total={STEPS}
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      >
        {step === 1 ? (
          <>
            <h2 className="signup-step-title">Hangi sınıftasın?</h2>
            <p className="mt-2 text-sm text-[var(--mk-muted)]">
              İçerik ve öneriler sınıfına göre ayarlanır.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GRADE_OPTIONS.map((g) => (
                <OnboardingChoice
                  key={g}
                  selected={grade === g}
                  onClick={() => setGrade(g)}
                  ariaLabel={g}
                  className="px-3 py-3 text-center text-sm font-medium"
                >
                  {g}
                  {grade === g ? (
                    <span className="signup-choice-check absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border border-[#e8a838] bg-[#e8a838] text-[#0c0a06]">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : null}
                </OnboardingChoice>
              ))}
            </div>
            <OnboardingContinue
              disabled={!grade}
              onClick={() => setStep(2)}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2 className="signup-step-title">Odak ders ve hedef</h2>
            <p className="mt-2 text-sm text-[var(--mk-muted)]">
              İstersen sonra ayarlardan değiştirebilirsin.
            </p>
            <div className="mk-card mt-6 space-y-5 p-5">
              <div className="space-y-3">
                <Label>Odak ders</Label>
                <div className="grid grid-cols-2 gap-2">
                  {SUBJECT_OPTIONS.map((s) => (
                    <OnboardingChoice
                      key={s.label}
                      selected={subject === s.label}
                      onClick={() => setSubject(s.label)}
                      ariaLabel={s.label}
                      className="flex items-center gap-2 p-3 text-sm"
                    >
                      <span aria-hidden>{s.emoji}</span>
                      {s.label}
                    </OnboardingChoice>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <Label>Hedefin</Label>
                <div className="space-y-2">
                  {GOAL_OPTIONS.map((g) => (
                    <OnboardingChoice
                      key={g.label}
                      selected={goal === g.label}
                      onClick={() => setGoal(g.label)}
                      ariaLabel={g.label}
                      className="block p-4"
                    >
                      <span className="block font-semibold">{g.label}</span>
                      <span className="block text-sm text-[var(--mk-muted)]">
                        {g.body}
                      </span>
                    </OnboardingChoice>
                  ))}
                </div>
              </div>
            </div>
            <OnboardingContinue onClick={() => setStep(3)} />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h2 className="signup-step-title">AI öğretmen stili</h2>
            <p className="mt-2 text-sm text-[var(--mk-muted)]">
              Yanıtların tonu ve detay seviyesi buna göre ayarlanır.
            </p>
            <div className="mk-card mt-6 space-y-2 p-4">
              {TUTOR_STYLE_OPTIONS.map((o) => (
                <OnboardingChoice
                  key={o.id}
                  selected={tutorStyle === o.id}
                  onClick={() => setTutorStyle(o.id as TutorStyle)}
                  ariaLabel={o.title}
                  className="block p-4"
                >
                  <span className="block font-semibold">
                    {o.emoji} {o.title}
                  </span>
                  <span className="block text-sm text-[var(--mk-muted)]">
                    {o.body}
                  </span>
                </OnboardingChoice>
              ))}
            </div>
            <OnboardingContinue
              disabled={saving}
              label={saving ? "Kaydediliyor…" : "Başla"}
              onClick={() => void finish()}
            />
          </>
        ) : null}
      </OnboardingShell>
    </AstraMarketingPage>
  );
}
