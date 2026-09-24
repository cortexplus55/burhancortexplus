"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  OnboardingChoice,
  OnboardingContinue,
  OnboardingShell,
} from "@/components/layout/onboarding-shell";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { createClient } from "@/lib/supabase/client";
import {
  GOAL_OPTIONS,
  GRADE_OPTIONS,
  SUBJECT_OPTIONS,
  TUTOR_STYLE_OPTIONS,
  homePathForRole,
} from "@/lib/parity/signup";
import { DEFAULT_TUTOR_STYLE, type TutorStyle } from "@/lib/learning/tutor-style";
import { DOCUMENT_ONBOARDING_HINT } from "@/lib/documents/upload-labels";
import { toast } from "sonner";
import "@/styles/parity-marketing.css";

const STEPS = 4;
const DRAFT_KEY = "cortex-onboarding-draft";

type Draft = {
  step: number;
  grade: string;
  subject: string;
  goal: string;
  examDate: string;
  hasDocument: "yes" | "no" | "";
  tutorStyle: TutorStyle;
};

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(1);
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [examDate, setExamDate] = useState("");
  const [hasDocument, setHasDocument] = useState<"yes" | "no" | "">("");
  const [tutorStyle, setTutorStyle] = useState<TutorStyle>(DEFAULT_TUTOR_STYLE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setStep(Math.min(Math.max(draft.step || 1, 1), STEPS));
      setGrade(draft.grade || "");
      setSubject(draft.subject || "");
      setGoal(draft.goal || "");
      setExamDate(draft.examDate || "");
      setHasDocument(draft.hasDocument || "");
      if (draft.tutorStyle) setTutorStyle(draft.tutorStyle);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ step, grade, subject, goal, examDate, hasDocument, tutorStyle } satisfies Draft),
      );
    } catch {
      /* private mode */
    }
  }, [hydrated, step, grade, subject, goal, examDate, hasDocument, tutorStyle]);

  const todayIso = new Date().toISOString().slice(0, 10);

  async function finish() {
    if (!goal) {
      toast.error("Hedefini seç", {
        description: "Hangi sınava hazırlandığını seçmen gerekiyor.",
      });
      setStep(2);
      return;
    }
    if (examDate && examDate < todayIso) {
      toast.error("Geçmiş bir sınav tarihi seçemezsin.");
      setStep(2);
      return;
    }
    if (!hasDocument) {
      toast.error("Belgen var mı?", { description: "Bir seçenek işaretle." });
      setStep(3);
      return;
    }
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

      if (goal) {
        const { data: goals } = await supabase
          .from("learning_goals")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);
        const payload = {
          user_id: user.id,
          goal_text: goal,
          target_date: examDate || null,
        };
        if (!goals?.length) {
          await supabase.from("learning_goals").insert(payload);
        } else if (examDate) {
          await supabase
            .from("learning_goals")
            .update({ target_date: examDate, goal_text: goal })
            .eq("id", goals[0].id);
        }
      }

      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }

      toast.success("Profilin hazır!");
      router.push(
        hasDocument === "yes"
          ? "/dokumanlar"
          : homePathForRole(existing?.primary_role),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) {
    return (
      <ParityMarketingPage
        variant="auth"
        title="Hoş geldin"
        description="Profilin yükleniyor…"
      >
        <p className="text-sm text-[var(--mk-muted)]" role="status">
          Kaydedilmiş adımların açılıyor…
        </p>
      </ParityMarketingPage>
    );
  }

  return (
    <ParityMarketingPage
      variant="auth"
      title="Hoş geldin"
      description="Sınav hedefini seç — sınıf, odak ve öğretmen stilin."
    >
      <OnboardingShell
        step={step}
        total={STEPS}
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
      >
        {step === 1 ? (
          <>
            <p className="onboarding-kicker">Profil</p>
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
            <p className="onboarding-kicker">Sınav</p>
            <h2 className="signup-step-title">Ne için hazırlanıyorsun?</h2>
            <p className="mt-2 text-sm text-[var(--mk-muted)]">
              Hedefin planı ve içerik tonunu belirler. İstersen sonra değiştirirsin.
            </p>
            <div className="mk-card mt-6 space-y-5 p-5">
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
              <div className="space-y-3">
                <Label>Odak ders (isteğe bağlı)</Label>
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
              <div className="space-y-2">
                <Label htmlFor="exam-date">Sınav tarihi (isteğe bağlı)</Label>
                <input
                  id="exam-date"
                  type="date"
                  min={todayIso}
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--mk-border)] bg-[var(--mk-surface)] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <OnboardingContinue
              disabled={!goal}
              label="Devam"
              onClick={() => setStep(3)}
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className="onboarding-kicker">Belge</p>
            <h2 className="signup-step-title">Çalışma belgen var mı?</h2>
            <p className="mt-2 text-sm text-[var(--mk-muted)]">
              {DOCUMENT_ONBOARDING_HINT}
            </p>
            <div className="mk-card mt-6 space-y-2 p-4">
              <OnboardingChoice
                selected={hasDocument === "yes"}
                onClick={() => setHasDocument("yes")}
                ariaLabel="Belgem var"
                className="block p-4"
              >
                <span className="block font-semibold">Belgem var</span>
                <span className="block text-sm text-[var(--mk-muted)]">
                  Bitince belge yükleme ekranına gideceksin.
                </span>
              </OnboardingChoice>
              <OnboardingChoice
                selected={hasDocument === "no"}
                onClick={() => setHasDocument("no")}
                ariaLabel="Belgem yok"
                className="block p-4"
              >
                <span className="block font-semibold">Belgem yok</span>
                <span className="block text-sm text-[var(--mk-muted)]">
                  Sonra istediğin zaman belge ekleyebilirsin.
                </span>
              </OnboardingChoice>
            </div>
            <OnboardingContinue
              disabled={!hasDocument}
              label="Devam"
              onClick={() => setStep(4)}
            />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <p className="onboarding-kicker">Öğretmen</p>
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
    </ParityMarketingPage>
  );
}
