"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import { passwordIssues } from "@/lib/auth/password";
import { cn } from "@/lib/utils";
import {
  AVATAR_OPTIONS,
  GOAL_OPTIONS,
  GRADE_OPTIONS,
  PARENT_INTRO_POINTS,
  PARENT_RELATION_OPTIONS,
  ROLE_OPTIONS,
  SIGNUP_STORAGE_KEY,
  SUBJECT_OPTIONS,
  isOptionalPhoneValid,
  stepIdsForRole,
  TUTOR_STYLE_OPTIONS,
  type SignupPayload,
  type SignupRole,
} from "@/lib/parity/signup";
import { authCallbackUrl, authErrorMessage } from "@/lib/auth/messages";
import { signInWithGoogle } from "@/lib/auth/google-oauth";
import { supabaseConfigIssue } from "@/lib/supabase/config-check";
import "@/styles/astra-marketing.css";
import "@/styles/cinematic-home.css";
import "@/styles/signup-wizard.css";

export function SignupWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entryPrompt, setEntryPrompt] = useState<string | null>(null);
  const [role, setRole] = useState<SignupRole | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Partial<SignupPayload>>({});

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);

  const steps = useMemo(
    () => (role ? stepIdsForRole(role) : ["role"]),
    [role],
  );
  const step = steps[stepIndex] ?? "role";
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  function next() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
  }

  function pickRole(value: SignupRole) {
    setRole(value);
    setDraft((d) => ({ ...d, role: value }));
    setStepIndex(1);
  }

  function buildPayload(): SignupPayload {
    return {
      role: role ?? "student",
      fullName: fullName.trim(),
      gradeLevel: draft.gradeLevel,
      schoolName: draft.schoolName,
      focusSubject: draft.focusSubject,
      learningGoal: draft.learningGoal,
      tutorStyle: draft.tutorStyle,
      avatarEmoji: draft.avatarEmoji,
      parentRelation: draft.parentRelation,
      parentPhone: draft.parentPhone?.trim() || undefined,
      parentLinkMode: draft.parentLinkMode,
      parentInviteCode: draft.parentInviteCode,
      parentInviteEmail: draft.parentInviteEmail,
      teacherInstitution: draft.teacherInstitution,
      teacherBranch: draft.teacherBranch,
      teacherClassName: draft.teacherClassName,
    };
  }

  function stashPayload(payload: SignupPayload) {
    try {
      localStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage kapalı olabilir */
    }
  }

  const configIssue = useMemo(() => supabaseConfigIssue(), []);

  useEffect(() => {
    if (configIssue) toast.error(configIssue, { duration: 8000 });
  }, [configIssue]);

  useEffect(() => {
    const prompt = searchParams.get("prompt")?.trim();
    if (prompt) setEntryPrompt(prompt);

    const ders = searchParams.get("ders")?.trim();
    if (!ders) return;
    const match = SUBJECT_OPTIONS.find(
      (s) => s.label.toLocaleLowerCase("tr") === ders.toLocaleLowerCase("tr"),
    );
    if (match) {
      setDraft((d) => ({ ...d, focusSubject: match.label }));
    }
  }, [searchParams]);

  async function submitAccount(event: React.FormEvent) {
    event.preventDefault();
    if (configIssue) {
      toast.error(configIssue);
      return;
    }
    const issues = passwordIssues(password);
    if (fullName.trim().length < 2) {
      toast.error("Ad soyad gerekli.");
      return;
    }
    if (issues.length) {
      toast.error(issues[0]);
      return;
    }
    if (password !== password2) {
      toast.error("Şifreler eşleşmiyor.");
      return;
    }
    if (!consent) {
      toast.error("Devam etmek için sözleşmeleri onaylaman gerekiyor.");
      return;
    }

    const payload = buildPayload();
    setLoading(true);
    stashPayload(payload);
    if (entryPrompt) {
      try {
        sessionStorage.setItem("cortex-entry-prompt", entryPrompt);
      } catch {
        /* ignore */
      }
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authCallbackUrl("/kayit/tamamla"),
        data: {
          full_name: payload.fullName,
          primary_role: payload.role,
          grade_level: payload.gradeLevel ?? "",
          school_name: payload.schoolName ?? payload.teacherInstitution ?? "",
          focus_subject: payload.focusSubject ?? payload.teacherBranch ?? "",
          learning_goal: payload.learningGoal ?? "",
          tutor_style: payload.tutorStyle ?? "step_by_step",
          onboarding_done: "false",
          parent_relation: payload.parentRelation ?? "",
          phone: payload.parentPhone ?? "",
        },
      },
    });

    if (error) {
      setLoading(false);
      const detail = authErrorMessage(error);
      toast.error(detail);
      console.error("[signup]", error.message, error);
      return;
    }

    if (data.user && data.user.identities?.length === 0) {
      setLoading(false);
      toast.error("Bu e-posta zaten kayıtlı. Giriş yap veya şifreni sıfırla.");
      return;
    }

    if (data.session) {
      setLoading(false);
      router.refresh();
      router.push("/kayit/tamamla");
      return;
    }

    setLoading(false);
    toast.success("Doğrulama e-postası gönderildi.");
    router.push("/email-dogrula");
  }

  async function googleSignup() {
    if (!consent) {
      toast.error("Devam etmek için sözleşmeleri onaylaman gerekiyor.");
      return;
    }
    stashPayload(buildPayload());
    const supabase = createClient();
    const { error } = await signInWithGoogle(
      supabase,
      authCallbackUrl("/kayit/tamamla"),
    );
    if (error) toast.error("Google ile kayıt başlatılamadı.");
  }

  return (
    <div className="signup-wizard astra-marketing cinematic-marketing cinematic-auth flex min-h-dvh flex-col">
      <div className="signup-progress-track w-full">
        <div
          className="signup-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <header className="flex items-center justify-between px-4 py-4">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={back}
            className="rounded-full p-2 text-[var(--mk-muted)] hover:bg-[var(--mk-surface)]"
            aria-label="Geri"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link href="/" className="text-sm font-semibold">
            Cortex Plus
          </Link>
        )}
        <span className="text-xs text-[var(--mk-muted)]">
          Adım {stepIndex + 1}/{steps.length}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10">
        {step === "role" ? (
          <StepShell
            title="Cortex Plus'a hoş geldin"
            subtitle="Seni en iyi şekilde karşılayabilmemiz için kim olduğunu seç."
          >
            <div className="space-y-3">
              {ROLE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => pickRole(option.id)}
                  className="signup-choice flex w-full items-center gap-4 p-4 text-left"
                  data-selected={role === option.id}
                >
                  <span className="text-2xl" aria-hidden>
                    {option.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{option.title}</span>
                    <span className="block text-sm text-[var(--mk-muted)]">
                      {option.body}
                    </span>
                  </span>
                  <span className="signup-choice-check" aria-hidden>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-[var(--mk-muted)]">
              Zaten hesabın var mı?{" "}
              <Link href="/giris" className="text-[var(--mk-primary)] underline">
                Giriş yap
              </Link>
            </p>
          </StepShell>
        ) : null}

        {step === "grade" ? (
          <StepShell
            title="Hangi sınıftasın?"
            subtitle="İçerikleri seviyene göre ayarlayacağız."
          >
            <div className="grid grid-cols-3 gap-2">
              {GRADE_OPTIONS.map((g) => (
                <ChoiceChip
                  key={g}
                  label={g}
                  selected={draft.gradeLevel === g}
                  onClick={() => setDraft((d) => ({ ...d, gradeLevel: g }))}
                />
              ))}
            </div>
            <ContinueButton disabled={!draft.gradeLevel} onClick={next} />
          </StepShell>
        ) : null}

        {step === "subject" ? (
          <StepShell
            title="En çok hangi derste desteğe ihtiyacın var?"
            subtitle="Başlangıç için birini seç, sonra hepsini kullanabilirsin."
          >
            <div className="grid grid-cols-2 gap-3">
              {SUBJECT_OPTIONS.map((s) => (
                <SignupChoice
                  key={s.label}
                  selected={draft.focusSubject === s.label}
                  onClick={() => setDraft((d) => ({ ...d, focusSubject: s.label }))}
                  className="flex items-center gap-3 p-4 text-left"
                >
                  <span className="text-xl" aria-hidden>
                    {s.emoji}
                  </span>
                  <span className="text-sm font-medium">{s.label}</span>
                </SignupChoice>
              ))}
            </div>
            <ContinueButton disabled={!draft.focusSubject} onClick={next} />
          </StepShell>
        ) : null}

        {step === "goal" ? (
          <StepShell
            title="Hedefin ne?"
            subtitle="Çalışma planını buna göre kuracağız."
          >
            <div className="space-y-3">
              {GOAL_OPTIONS.map((g) => (
                <SignupChoice
                  key={g.label}
                  selected={draft.learningGoal === g.label}
                  onClick={() => setDraft((d) => ({ ...d, learningGoal: g.label }))}
                  className="w-full p-4 text-left"
                >
                  <span className="block font-semibold">{g.label}</span>
                  <span className="block text-sm text-[var(--mk-muted)]">
                    {g.body}
                  </span>
                </SignupChoice>
              ))}
            </div>
            <ContinueButton disabled={!draft.learningGoal} onClick={next} />
          </StepShell>
        ) : null}

        {step === "tutor-style" ? (
          <StepShell
            title="AI öğretmenin nasıl anlatsın?"
            subtitle="Tercihini istediğin zaman profilden değiştirebilirsin."
          >
            <div className="space-y-3">
              {TUTOR_STYLE_OPTIONS.map((option) => (
                <SignupChoice
                  key={option.id}
                  selected={draft.tutorStyle === option.id}
                  onClick={() =>
                    setDraft((d) => ({ ...d, tutorStyle: option.id }))
                  }
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <span className="text-xl" aria-hidden>
                    {option.emoji}
                  </span>
                  <span className="min-w-0 flex-1 pr-6">
                    <span className="block font-semibold">{option.title}</span>
                    <span className="block text-sm text-[var(--mk-muted)]">
                      {option.body}
                    </span>
                  </span>
                </SignupChoice>
              ))}
            </div>
            <ContinueButton disabled={!draft.tutorStyle} onClick={next} />
          </StepShell>
        ) : null}

        {step === "avatar" ? (
          <StepShell
            title="Avatarını seç"
            subtitle="Profilinde bu görünecek. İstediğin zaman değiştirebilirsin."
          >
            <div className="grid grid-cols-4 gap-3">
              {AVATAR_OPTIONS.map((a) => (
                <SignupChoice
                  key={a}
                  selected={draft.avatarEmoji === a}
                  onClick={() => setDraft((d) => ({ ...d, avatarEmoji: a }))}
                  className="flex aspect-square items-center justify-center text-2xl"
                  ariaLabel={`Avatar ${a}`}
                  showCheck={false}
                >
                  {a}
                </SignupChoice>
              ))}
            </div>
            <ContinueButton onClick={next} secondaryLabel="Atla" onSecondary={next} />
          </StepShell>
        ) : null}

        {step === "parent-intro" ? (
          <StepShell
            title="İlerlemeyi gör, Plus’ı sen al"
            subtitle="Raporlar ücretsizdir. Sohbet içerikleri gizli kalır. Plus kotası çocuğunun hesabına gider."
          >
            <ul className="space-y-3">
              {PARENT_INTRO_POINTS.map((item) => (
                <li key={item} className="mk-card p-4 text-sm">
                  {item}
                </li>
              ))}
            </ul>
            <ContinueButton onClick={next} />
          </StepShell>
        ) : null}

        {step === "parent-relation" ? (
          <StepShell
            title="Çocuğunla yakınlığın"
            subtitle="Hesabı doğru kişilere bağlamak ve bildirimleri netleştirmek için."
          >
            <div className="space-y-3">
              {PARENT_RELATION_OPTIONS.map((option) => (
                <SignupChoice
                  key={option.id}
                  selected={draft.parentRelation === option.id}
                  onClick={() =>
                    setDraft((d) => ({ ...d, parentRelation: option.id }))
                  }
                  className="w-full p-4 text-left"
                >
                  <span className="block font-semibold">{option.title}</span>
                  <span className="block text-sm text-[var(--mk-muted)]">
                    {option.body}
                  </span>
                </SignupChoice>
              ))}
            </div>
            <ContinueButton disabled={!draft.parentRelation} onClick={next} />
          </StepShell>
        ) : null}

        {step === "parent-phone" ? (
          <StepShell
            title="Telefonun (isteğe bağlı)"
            subtitle="Ödeme ve bağlantı bildirimleri için. Şimdi atlayabilirsin."
          >
            <div className="space-y-2">
              <Label htmlFor="parent-phone">Cep telefonu</Label>
              <Input
                id="parent-phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={draft.parentPhone ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, parentPhone: e.target.value }))
                }
                placeholder="05xx xxx xx xx"
                aria-label="Cep telefonu"
                className="border-[var(--mk-border)] bg-[#0c0c0c]"
              />
              {draft.parentPhone?.trim() &&
              !isOptionalPhoneValid(draft.parentPhone) ? (
                <p className="text-xs text-amber-300">
                  En az 10 haneli bir numara gir veya bu adımı geç.
                </p>
              ) : null}
            </div>
            <ContinueButton
              disabled={!isOptionalPhoneValid(draft.parentPhone)}
              onClick={next}
              secondaryLabel="Şimdilik geç"
              onSecondary={() => {
                setDraft((d) => ({ ...d, parentPhone: undefined }));
                next();
              }}
            />
          </StepShell>
        ) : null}

        {step === "parent-link" ? (
          <StepShell
            title="Çocuğunu bağla"
            subtitle="Kod veya e-posta ile istek gönder. Öğrenci onaylayana kadar rapor ve Plus kapalı kalır."
          >
            <div className="space-y-3">
              <LinkModeCard
                title="Davet kodu gir"
                body="Çocuğunun profilindeki 6 haneli kod."
                selected={draft.parentLinkMode === "code"}
                onSelect={() => setDraft((d) => ({ ...d, parentLinkMode: "code" }))}
              >
                <Input
                  value={draft.parentInviteCode ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      parentLinkMode: "code",
                      parentInviteCode: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="ÖRN: 4KD9PX"
                  aria-label="Davet kodu"
                  maxLength={8}
                  className="border-[var(--mk-border)] bg-[#0c0c0c] uppercase tracking-widest"
                />
              </LinkModeCard>

              <LinkModeCard
                title="E-posta ile davet et"
                body="Çocuğun onayladığında bağlantı kurulur."
                selected={draft.parentLinkMode === "email"}
                onSelect={() => setDraft((d) => ({ ...d, parentLinkMode: "email" }))}
              >
                <Input
                  type="email"
                  value={draft.parentInviteEmail ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      parentLinkMode: "email",
                      parentInviteEmail: e.target.value,
                    }))
                  }
                  placeholder="ogrenci@ornek.com"
                  aria-label="Öğrenci e-postası"
                  className="border-[var(--mk-border)] bg-[#0c0c0c]"
                />
              </LinkModeCard>
            </div>
            <ContinueButton
              disabled={
                draft.parentLinkMode === "code"
                  ? (draft.parentInviteCode ?? "").trim().length < 4
                  : draft.parentLinkMode === "email"
                    ? !(draft.parentInviteEmail ?? "").includes("@")
                    : true
              }
              onClick={next}
              secondaryLabel="Çocuğumun hesabı yok, sonra bağlayacağım"
              onSecondary={() => {
                setDraft((d) => ({
                  ...d,
                  parentLinkMode: "later",
                  parentInviteCode: undefined,
                  parentInviteEmail: undefined,
                }));
                next();
              }}
            />
          </StepShell>
        ) : null}

        {step === "teacher-school" ? (
          <StepShell
            title="Okulun ve branşın"
            subtitle="Sınıflarını oluştururken kullanacağız."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="institution">Okul / kurum</Label>
                <Input
                  id="institution"
                  value={draft.teacherInstitution ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, teacherInstitution: e.target.value }))
                  }
                  placeholder="Örn. Atatürk Anadolu Lisesi"
                  className="border-[var(--mk-border)] bg-[#0c0c0c]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branş</Label>
                <Input
                  id="branch"
                  value={draft.teacherBranch ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, teacherBranch: e.target.value }))
                  }
                  placeholder="Örn. Matematik"
                  className="border-[var(--mk-border)] bg-[#0c0c0c]"
                />
              </div>
              <p className="text-xs text-[var(--mk-muted)]">
                Kayıt bitince öğretmen paneli açılır. Doğrulama sonrası tam ödev
                hakları; Plus ile sınırsız sınıf ve rapor.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {SUBJECT_OPTIONS.slice(0, 6).map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      draft.teacherBranch === s.label
                        ? "border-[var(--mk-primary)] bg-[var(--mk-primary)]/20"
                        : "border-[var(--mk-border)]",
                    )}
                    onClick={() =>
                      setDraft((d) => ({ ...d, teacherBranch: s.label }))
                    }
                  >
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </div>
            <ContinueButton
              disabled={!draft.teacherInstitution?.trim()}
              onClick={next}
            />
          </StepShell>
        ) : null}

        {step === "teacher-class" ? (
          <StepShell
            title="İlk sınıfını oluştur"
            subtitle="Öğrencilerin bu sınıfa katılım koduyla girecek."
          >
            <div className="space-y-2">
              <Label htmlFor="teacher-class">Sınıf adı</Label>
              <Input
                id="teacher-class"
                value={draft.teacherClassName ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, teacherClassName: e.target.value }))
                }
                placeholder="Örn. 10-A Fen"
                className="border-[var(--mk-border)] bg-[#0c0c0c]"
              />
            </div>
            <ContinueButton
              disabled={!draft.teacherClassName?.trim()}
              onClick={next}
              secondaryLabel="Sonra oluşturacağım"
              onSecondary={() => {
                setDraft((d) => ({ ...d, teacherClassName: undefined }));
                next();
              }}
            />
          </StepShell>
        ) : null}

        {step === "account" ? (
          <StepShell
            title="Hesabını oluştur"
            subtitle="Son adım — bilgilerin güvenle saklanır."
          >
            {entryPrompt ? (
              <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                Kayıt sonrası AI öğretmene iletilecek soru:{" "}
                <span className="font-medium text-amber-50">&ldquo;{entryPrompt}&rdquo;</span>
              </p>
            ) : null}
            <form onSubmit={submitAccount} className="signup-account-panel space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Ad soyad</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="border-[var(--mk-border)] bg-[#0c0c0c]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-posta</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-[var(--mk-border)] bg-[#0c0c0c]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-[var(--mk-border)] bg-[#0c0c0c]"
                />
                <p className="text-xs text-[var(--mk-muted)]">
                  En az 8 karakter, bir büyük harf, bir küçük harf ve bir rakam.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password2">Şifre tekrar</Label>
                <Input
                  id="password2"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  className="border-[var(--mk-border)] bg-[#0c0c0c]"
                />
              </div>

              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(value) => setConsent(value === true)}
                />
                <span className="text-[var(--mk-muted)]">
                  <Link href="/kvkk" className="underline">
                    KVKK aydınlatma metnini
                  </Link>{" "}
                  ve{" "}
                  <Link href="/kullanim-kosullari" className="underline">
                    kullanım koşullarını
                  </Link>{" "}
                  okudum, kabul ediyorum.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="signup-continue w-full"
              >
                {loading ? "Oluşturuluyor…" : "Hesabı oluştur"}
              </button>
              <button
                type="button"
                onClick={googleSignup}
                className="mk-btn-outline w-full py-3 text-sm font-medium"
              >
                Google ile devam et
              </button>
            </form>
          </StepShell>
        ) : null}
      </main>
    </div>
  );
}

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col pt-6">
      <h1 className="signup-step-title">{title}</h1>
      {subtitle ? (
        <p className="mt-2 text-sm text-[var(--mk-muted)]">{subtitle}</p>
      ) : null}
      <div className="mt-8 flex-1">{children}</div>
    </div>
  );
}

function SignupChoice({
  selected,
  onClick,
  children,
  className,
  ariaLabel,
  showCheck = true,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  showCheck?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
      data-selected={selected}
      className={cn("signup-choice relative", className)}
    >
      {children}
      {showCheck ? (
        <span className="signup-choice-check absolute right-3 top-3" aria-hidden>
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

function ChoiceChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <SignupChoice
      selected={selected}
      onClick={onClick}
      className="px-3 py-3 text-center text-sm font-medium"
      ariaLabel={label}
      showCheck={false}
    >
      {label}
    </SignupChoice>
  );
}

function LinkModeCard({
  title,
  body,
  selected,
  onSelect,
  children,
}: {
  title: string;
  body: string;
  selected: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <SignupChoice
      selected={selected}
      onClick={onSelect}
      className="block w-full p-4 text-left"
    >
      <span className="block font-semibold">{title}</span>
      <span className="block text-sm text-[var(--mk-muted)]">{body}</span>
      {selected && children ? <div className="mt-3 pr-8">{children}</div> : null}
    </SignupChoice>
  );
}

function ContinueButton({
  disabled,
  onClick,
  secondaryLabel,
  onSecondary,
}: {
  disabled?: boolean;
  onClick: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="mt-8 space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="signup-continue"
      >
        Devam
      </button>
      {secondaryLabel && onSecondary ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onSecondary}
          className="w-full text-[var(--mk-muted)]"
        >
          {secondaryLabel}
        </Button>
      ) : null}
    </div>
  );
}
