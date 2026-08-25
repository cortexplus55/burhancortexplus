"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
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
  ROLE_OPTIONS,
  SIGNUP_STORAGE_KEY,
  SUBJECT_OPTIONS,
  searchSchools,
  stepIdsForRole,
  type SignupPayload,
  type SignupRole,
} from "@/lib/parity/signup";
import { completeSignup } from "./actions";
import "@/styles/astra-marketing.css";

export function SignupWizard() {
  const router = useRouter();
  const [role, setRole] = useState<SignupRole | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Partial<SignupPayload>>({});
  const [schoolOptions, setSchoolOptions] = useState<string[]>(() =>
    searchSchools(""),
  );
  const [schoolQuery, setSchoolQuery] = useState("");

  useEffect(() => {
    const q = schoolQuery.trim();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/schools/search?q=${encodeURIComponent(q)}`,
        );
        const payload = await res.json();
        if (Array.isArray(payload.schools) && payload.schools.length) {
          setSchoolOptions(payload.schools);
        } else {
          setSchoolOptions(searchSchools(q));
        }
      } catch {
        setSchoolOptions(searchSchools(q));
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [schoolQuery]);

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
      avatarEmoji: draft.avatarEmoji,
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

  async function submitAccount(event: React.FormEvent) {
    event.preventDefault();
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

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/kayit/tamamla`,
        data: {
          full_name: payload.fullName,
          primary_role: payload.role,
          grade_level: payload.gradeLevel ?? "",
          school_name: payload.schoolName ?? payload.teacherInstitution ?? "",
          focus_subject: payload.focusSubject ?? payload.teacherBranch ?? "",
          learning_goal: payload.learningGoal ?? "",
          onboarding_done: "true",
        },
      },
    });

    if (error) {
      setLoading(false);
      toast.error("Kayıt tamamlanamadı. Bilgilerini kontrol et.");
      return;
    }

    if (data.session) {
      const result = await completeSignup(payload);
      setLoading(false);
      if (result.ok) {
        if (result.linkWarning) toast.warning(result.linkWarning);
        router.push(result.redirectTo);
        router.refresh();
        return;
      }
      toast.error(result.error);
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
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/kayit/tamamla`,
      },
    });
  }

  return (
    <div className="astra-marketing flex min-h-dvh flex-col">
      <div className="h-1 w-full bg-[var(--mk-surface)]">
        <div
          className="h-1 bg-[var(--mk-primary)] transition-all duration-300"
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
                  className="mk-card flex w-full items-center gap-4 p-4 text-left transition-colors hover:border-[var(--mk-primary)]"
                >
                  <span className="text-2xl" aria-hidden>
                    {option.emoji}
                  </span>
                  <span>
                    <span className="block font-semibold">{option.title}</span>
                    <span className="block text-sm text-[var(--mk-muted)]">
                      {option.body}
                    </span>
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

        {step === "school" ? (
          <StepShell
            title="Hangi okula gidiyorsun?"
            subtitle="Okulunu ara veya kendin yaz."
          >
            <Input
              value={schoolQuery}
              onChange={(e) => {
                setSchoolQuery(e.target.value);
                setDraft((d) => ({ ...d, schoolName: e.target.value }));
              }}
              placeholder="Okul ara"
              aria-label="Okul ara"
              className="border-[var(--mk-border)] bg-[#0c0c0c]"
            />
            <ul className="mt-3 space-y-2">
              {schoolOptions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => {
                      setSchoolQuery(s);
                      setDraft((d) => ({ ...d, schoolName: s }));
                    }}
                    className={cn(
                      "mk-card w-full p-3 text-left text-sm transition-colors",
                      draft.schoolName === s
                        ? "border-[var(--mk-primary)]"
                        : "hover:border-[var(--mk-primary)]",
                    )}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
            <ContinueButton
              onClick={next}
              secondaryLabel="Sonra ekle"
              onSecondary={() => {
                setSchoolQuery("");
                setDraft((d) => ({ ...d, schoolName: undefined }));
                next();
              }}
            />
          </StepShell>
        ) : null}

        {step === "subject" ? (
          <StepShell
            title="En çok hangi derste desteğe ihtiyacın var?"
            subtitle="Başlangıç için birini seç, sonra hepsini kullanabilirsin."
          >
            <div className="grid grid-cols-2 gap-3">
              {SUBJECT_OPTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, focusSubject: s.label }))}
                  className={cn(
                    "mk-card flex items-center gap-3 p-4 text-left transition-colors",
                    draft.focusSubject === s.label
                      ? "border-[var(--mk-primary)]"
                      : "hover:border-[var(--mk-primary)]",
                  )}
                >
                  <span className="text-xl" aria-hidden>
                    {s.emoji}
                  </span>
                  <span className="text-sm font-medium">{s.label}</span>
                </button>
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
                <button
                  key={g.label}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, learningGoal: g.label }))}
                  className={cn(
                    "mk-card w-full p-4 text-left transition-colors",
                    draft.learningGoal === g.label
                      ? "border-[var(--mk-primary)]"
                      : "hover:border-[var(--mk-primary)]",
                  )}
                >
                  <span className="block font-semibold">{g.label}</span>
                  <span className="block text-sm text-[var(--mk-muted)]">
                    {g.body}
                  </span>
                </button>
              ))}
            </div>
            <ContinueButton disabled={!draft.learningGoal} onClick={next} />
          </StepShell>
        ) : null}

        {step === "avatar" ? (
          <StepShell
            title="Avatarını seç"
            subtitle="Profilinde bu görünecek. İstediğin zaman değiştirebilirsin."
          >
            <div className="grid grid-cols-4 gap-3">
              {AVATAR_OPTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, avatarEmoji: a }))}
                  className={cn(
                    "mk-card flex aspect-square items-center justify-center text-2xl transition-colors",
                    draft.avatarEmoji === a
                      ? "border-[var(--mk-primary)]"
                      : "hover:border-[var(--mk-primary)]",
                  )}
                  aria-label={`Avatar ${a}`}
                >
                  {a}
                </button>
              ))}
            </div>
            <ContinueButton onClick={next} secondaryLabel="Atla" onSecondary={next} />
          </StepShell>
        ) : null}

        {step === "parent-intro" ? (
          <StepShell
            title="Çocuğunun yanında ol"
            subtitle="Cortex Plus veli hesabıyla ilerlemeyi görür, aboneliği yönetir ve destek fikirleri alırsın."
          >
            <ul className="space-y-3">
              {[
                "Çocuğunun çalışma serisi ve deneme sonuçları",
                "Plus / Sigma aboneliğini tek yerden yönetme",
                "Veliye özel AI: “Nasıl destek olurum?”",
              ].map((item) => (
                <li key={item} className="mk-card p-4 text-sm">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-[var(--mk-muted)]">
              Çocuğunun sohbet içerikleri gizlidir; yalnızca özet ve ilerleme
              paylaşılır.
            </p>
            <ContinueButton onClick={next} />
          </StepShell>
        ) : null}

        {step === "parent-link" ? (
          <StepShell
            title="Çocuğunu bağla"
            subtitle="Nasıl bağlanmak istersin?"
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

              <LinkModeCard
                title="Şimdilik atla"
                body="Sadece Plus aboneliğini yönetmek istiyorum."
                selected={draft.parentLinkMode === "later"}
                onSelect={() => setDraft((d) => ({ ...d, parentLinkMode: "later" }))}
              />
            </div>
            <ContinueButton
              disabled={!draft.parentLinkMode}
              onClick={next}
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
                Öğretmen paneli erişimi, kayıt sonrası doğrulama onayıyla açılır.
              </p>
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
            <form onSubmit={submitAccount} className="space-y-4">
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

              <Button
                type="submit"
                disabled={loading}
                className="mk-btn-primary w-full py-3"
              >
                {loading ? "Oluşturuluyor…" : "Hesabı oluştur"}
              </Button>
              <Button
                type="button"
                onClick={googleSignup}
                className="mk-btn-outline w-full py-3"
                variant="ghost"
              >
                Google ile devam et
              </Button>
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
      <h1 className="text-2xl font-bold leading-snug">{title}</h1>
      {subtitle ? (
        <p className="mt-2 text-sm text-[var(--mk-muted)]">{subtitle}</p>
      ) : null}
      <div className="mt-8 flex-1">{children}</div>
    </div>
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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mk-card px-3 py-3 text-sm font-medium transition-colors",
        selected ? "border-[var(--mk-primary)]" : "hover:border-[var(--mk-primary)]",
      )}
    >
      {label}
    </button>
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
    <div
      className={cn(
        "mk-card p-4 transition-colors",
        selected ? "border-[var(--mk-primary)]" : "",
      )}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-[var(--mk-muted)]">{body}</span>
      </button>
      {selected && children ? <div className="mt-3">{children}</div> : null}
    </div>
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
      <Button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mk-btn-primary w-full py-3 disabled:opacity-50"
      >
        Devam
      </Button>
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
