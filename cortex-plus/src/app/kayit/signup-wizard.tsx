"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReadGate, type ReadGateChange } from "@/components/legal/read-gate";
import { signupPresetFor, type SignupPreset } from "@/lib/parity/signup-preset";
import { Checkbox } from "@/components/ui/checkbox";
import { MARKETING_CONSENT_HINT, MARKETING_CONSENT_TEXT } from "@/lib/legal/marketing-consent";
import {
  AgeDeclarationField,
  EMPTY_AGE,
  ageDeclarationOf,
  type AgeValue,
} from "@/components/legal/age-declaration";
import { ageProblem, type ConsentEvidence } from "@/lib/legal/consent-evidence";
import { createClient } from "@/lib/supabase/client";
import { passwordIssues } from "@/lib/auth/password";
import {
  DISPOSABLE_EMAIL_MESSAGE,
  isDisposableEmail,
} from "@/lib/auth/email-policy";
import { cn } from "@/lib/utils";
import {
  AVATAR_OPTIONS,
  GOAL_OPTIONS,
  GRADE_OPTIONS,
  SIGNUP_NEXT_KEY,
  SIGNUP_STORAGE_KEY,
  SUBJECT_OPTIONS,
  stepIdsForRole,
  TUTOR_STYLE_OPTIONS,
  type SignupPayload,
} from "@/lib/parity/signup";
import { authCallbackUrl } from "@/lib/auth/messages";
import { signInWithGoogle } from "@/lib/auth/google-oauth";
import { useGoogleBlockedWebViewApp } from "@/lib/auth/in-app-browser";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { GoogleBlockedNote } from "@/components/auth/google-blocked-note";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { foldTr } from "@/lib/documents/page-analysis";
import { supabaseConfigIssue } from "@/lib/supabase/config-check";
import { readGuestMarker } from "@/lib/documents/guest-handoff";
import { SignupPremiumShell } from "@/components/layout/signup-premium-shell";
import "@/styles/cortex-premium.css";
import "@/styles/signup-wizard.css";

export function SignupWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entryPrompt, setEntryPrompt] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Partial<SignupPayload>>({});
  // Ana sayfanın hedef kitle sekmesi (7 Kasım 2026): `?hedef=` sınıf ve hedef sınavı önceden seçer / öne çıkarır.
  const presetRef = useRef<SignupPreset | null>(null);
  const [suggestedGrades, setSuggestedGrades] = useState<string[]>([]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  // Uyum paketi (7 Kasım 2026): iki metin ayrı ayrı ve yalnız açılıp sonuna kadar okununca onaylanır; yaş
  // beyanı ve 18 altındaysa velinin izni. Kanıt (sürüm, açılış ve onay anı) sunucuya gider.
  const [kvkkRead, setKvkkRead] = useState<ReadGateChange>({ checked: false, evidence: null });
  const [termsRead, setTermsRead] = useState<ReadGateChange>({ checked: false, evidence: null });
  const [age, setAge] = useState<AgeValue>(EMPTY_AGE);
  // Duyuru ve kampanya e-postası izni: isteğe bağlı, işaretli gelmez, hizmet buna bağlı değil (7 Kasım 2026).
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  // Ana sayfanın kokpitinde kendi dosyasını bırakan misafir (`?kaynak=belge`, 11 Kasım 2026): dosya tarayıcıda
  // bekliyor; kayıt bitince kurulumda sunulur. Burada yalnız adı hatırlatılır, hiçbir şey yüklenmez.
  const [guestDocument, setGuestDocument] = useState<string | null>(null);
  const blockedApp = useGoogleBlockedWebViewApp();

  const steps = useMemo(() => stepIdsForRole("student"), []);
  const step = steps[stepIndex] ?? "role";
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  function next() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
  }

  /** Onay adımında eksik olan ilk şey (yoksa null). Google ve e-posta yolu aynı kuralı kullanır. */
  function consentIssue(): string | null {
    const ageIssue = ageProblem(ageDeclarationOf(age));
    if (ageIssue) return ageIssue;
    if (!kvkkRead.checked || !kvkkRead.evidence) {
      return "KVKK Aydınlatma Metni'ni açıp sonuna kadar okumalı ve onaylamalısın.";
    }
    if (!termsRead.checked || !termsRead.evidence) {
      return "Kullanım Koşulları'nı açıp sonuna kadar okumalı ve kabul etmelisin.";
    }
    return null;
  }

  function consentEvidence(): ConsentEvidence {
    return {
      ...(kvkkRead.evidence ? { kvkk_aydinlatma: kvkkRead.evidence } : {}),
      ...(termsRead.evidence ? { kullanim_kosullari: termsRead.evidence } : {}),
    };
  }

  function buildPayload(): SignupPayload {
    let referralCode: string | undefined;
    try {
      referralCode =
        searchParams.get("ref")?.trim() ||
        sessionStorage.getItem("cortex-referral-code") ||
        undefined;
    } catch {
      referralCode = searchParams.get("ref")?.trim() || undefined;
    }
    return {
      role: "student",
      fullName: fullName.trim(),
      gradeLevel: draft.gradeLevel,
      schoolName: draft.schoolName,
      focusSubject: draft.focusSubject,
      learningGoal: draft.learningGoal,
      tutorStyle: draft.tutorStyle,
      // Avatar adımı kalktı (31 Ekim 2026, Paket J1 #2): varsayılan avatar; profilden değişir.
      avatarEmoji: draft.avatarEmoji ?? AVATAR_OPTIONS[0],
      referralCode,
      consentEvidence: consentEvidence(),
      ageDeclaration: ageDeclarationOf(age) ?? undefined,
      marketingEmail: marketing || undefined,
    };
  }

  function stashPayload(payload: SignupPayload) {
    try {
      localStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(payload));
      // Satın almaya basan misafir /kayit?next=/pay'e geliyor; kayıt
      // bitince oraya dönmeli, dashboard'a değil. Doğrulama bağlantısı
      // aynı tarayıcıda açılınca tamamla sayfası bunu okuyor.
      const target = searchParams.get("next");
      if (target) localStorage.setItem(SIGNUP_NEXT_KEY, target);
      else localStorage.removeItem(SIGNUP_NEXT_KEY);
    } catch {
      /* storage kapalı olabilir */
    }
  }

  const configIssue = useMemo(() => supabaseConfigIssue(), []);

  useEffect(() => {
    if (configIssue) toast.error(configIssue, { duration: 8000 });
  }, [configIssue]);

  useEffect(() => {
    const ref = searchParams.get("ref")?.trim();
    if (ref) {
      try {
        sessionStorage.setItem("cortex-referral-code", ref);
      } catch {
        /* ignore */
      }
    }

    const prompt = searchParams.get("prompt")?.trim();
    if (prompt) setEntryPrompt(prompt);

    if (searchParams.get("kaynak") === "belge") {
      const marker = readGuestMarker();
      if (marker) setGuestDocument(marker.names.length === 1 ? `“${marker.names[0]}”` : `${marker.names.length} dosya`);
    }

    const preset = signupPresetFor(searchParams.get("hedef"));
    if (preset) {
      presetRef.current = preset;
      setSuggestedGrades(preset.suggestedGrades);
      // Yalnız boş alanlar dolar: öğrenci geri gelip değiştirdiyse seçimi ezilmez.
      setDraft((d) => ({
        ...d,
        gradeLevel: d.gradeLevel ?? preset.gradeLevel,
        learningGoal: d.learningGoal ?? preset.learningGoal,
      }));
    }

    const ders = searchParams.get("ders")?.trim();
    if (!ders) return;
    // Pazarlama sayfası slug gönderiyor (?ders=turkce); etiket "Türkçe".
    // Yalnızca küçük harfe çevirmek "turkce", "ingilizce", "cografya"yı
    // hiç eşleştirmiyordu — aksanlar da katlanıyor.
    const match = SUBJECT_OPTIONS.find((s) => foldTr(s.label) === foldTr(ders));
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
    const issue = consentIssue();
    if (issue) {
      toast.error(issue);
      return;
    }
    // Kuralı burada söylüyoruz ki kullanıcı kayıt olduktan sonra hakkının
    // neden kısıtlı olduğunu aramasın. Asıl kontrol veritabanında.
    if (isDisposableEmail(email)) {
      toast.error(DISPOSABLE_EMAIL_MESSAGE);
      return;
    }

    setLoading(true);
    const payload = { ...buildPayload(), consentAcceptedAt: new Date().toISOString() };
    stashPayload(payload);
    if (entryPrompt) {
      try {
        sessionStorage.setItem("cortex-entry-prompt", entryPrompt);
      } catch {
        /* ignore */
      }
    }

    // Hemen gir, içeride onayla (31 Ekim 2026, Paket J1 #1): hesap sunucuda açılır, öğrenci şifresiyle hemen girer;
    // doğrulama bağlantısı arkadan, Resend üzerinden gider ve içeride şerit hatırlatır.
    // 8 Kasım 2026: Supabase'in kendi kayıt yolu (`auth.signUp` + kendi e-postası) KALDIRILDI. O e-posta gelmiyordu
    // (saatte 30, Gmail SMTP) ve öğrenciyi "doğrulama e-postası bekleniyor" ekranında bırakıyordu. Uç düşerse
    // (5xx, ağ) aynı uca bir kez daha denenir; yine düşerse öğrenci nedenini bilerek yeniden dener.
    const failedText = "Kayıt şu an tamamlanamadı. Birkaç saniye sonra yeniden dene.";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            fullName: payload.fullName,
            gradeLevel: payload.gradeLevel,
            learningGoal: payload.learningGoal,
            tutorStyle: payload.tutorStyle,
            avatarEmoji: payload.avatarEmoji,
            consentAcceptedAt: payload.consentAcceptedAt,
            consentEvidence: payload.consentEvidence,
            ageDeclaration: payload.ageDeclaration,
            marketingEmail: payload.marketingEmail,
            next: safeNextPath(searchParams.get("next"), ""),
            referralCode: payload.referralCode,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string; fallback?: boolean };
        if (response.ok) {
          const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
          if (!signInError) {
            router.refresh();
            router.push("/kayit/tamamla");
            return;
          }
          setLoading(false);
          toast.error("Hesabın açıldı ama giriş yapılamadı. Giriş sayfasından e-posta ve şifrenle devam et.");
          router.push("/giris");
          return;
        }
        if (response.status < 500 && !body.fallback) {
          setLoading(false);
          toast.error(body.error ?? failedText);
          return;
        }
      } catch {
        /* ağ kopması: bir kez daha denenir */
      }
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    setLoading(false);
    toast.error(failedText);
  }

  async function googleSignup() {
    const issue = consentIssue();
    if (issue) {
      toast.error(issue);
      return;
    }
    stashPayload({ ...buildPayload(), consentAcceptedAt: new Date().toISOString() });
    const supabase = createClient();
    const { error } = await signInWithGoogle(
      supabase,
      authCallbackUrl("/kayit/tamamla"),
    );
    if (error) toast.error("Google ile kayıt başlatılamadı.");
  }

  const headerStart =
    stepIndex > 0 ? (
      <button
        type="button"
        onClick={back}
        className="rounded-full p-2 text-[var(--cx-muted)] hover:bg-[var(--cx-surface-solid)]"
        aria-label="Geri"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
    ) : (
      <Link
        href="/"
        className="text-sm font-semibold text-[var(--cx-gold-hover)]"
      >
        Cortex Plus
      </Link>
    );

  return (
    <SignupPremiumShell
      progress={progress}
      stepLabel={`Adım ${stepIndex + 1}/${steps.length}`}
      headerStart={headerStart}
      loginHref={
        safeNextPath(searchParams.get("next"), "")
          ? `/giris?next=${encodeURIComponent(safeNextPath(searchParams.get("next"), ""))}`
          : "/giris"
      }
    >
      <div className="signup-wizard flex flex-1 flex-col">
        {guestDocument ? (
          <p className="signup-guest-doc" role="status">
            <span aria-hidden>📎</span> Ana sayfada seçtiğin {guestDocument} bu cihazda bekliyor; hesabın açılınca kurulumda
            tek dokunuşla eklenir.
          </p>
        ) : null}
        {step === "level" ? (
          <StepShell
            title="Hangi sınıftasın, hedefin ne?"
            subtitle="İçerikleri seviyene ve sınavına göre ayarlayacağız."
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {GRADE_OPTIONS.map((g) => (
                <ChoiceChip
                  key={g}
                  label={g}
                  selected={draft.gradeLevel === g}
                  suggested={suggestedGrades.includes(g)}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      gradeLevel: g,
                      // YKS/LGS sekmesinden gelen 8. sınıf → LGS, lise ve mezun → YKS (sekme kararı sınıfa uyar).
                      learningGoal: presetRef.current?.goalForGrade?.(g) ?? d.learningGoal,
                    }))
                  }
                />
              ))}
            </div>
            {suggestedGrades.length ? (
              <p className="signup-suggested-note">Kesikli çerçeveli seçenekler seçtiğin hedefe uygun; birini seç.</p>
            ) : null}
            <p className="signup-step-label mt-5 mb-2 text-sm font-semibold">Hedef sınavın</p>
            <div className="grid grid-cols-2 gap-2">
              {GOAL_OPTIONS.map((g) => (
                <SignupChoice
                  key={g.label}
                  selected={draft.learningGoal === g.label}
                  onClick={() => setDraft((d) => ({ ...d, learningGoal: g.label }))}
                  className="w-full p-3 text-left"
                >
                  <span className="block text-sm font-semibold">{g.label}</span>
                  <span className="block text-xs text-[var(--mk-muted)]">{g.body}</span>
                </SignupChoice>
              ))}
            </div>
            <ContinueButton disabled={!draft.gradeLevel || !draft.learningGoal} onClick={next} />
            <PreviewLessonLink />
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
            {/*
              Google önce (31 Ekim 2026, lansman zırhı): giriş sayfasında olduğu gibi. Formun altında ikincil düğmeydi;
              Google'la kayıt şifre kurmadan ve doğrulama e-postası beklemeden biter (Supabase'in e-posta gönderim
              sınırına da takılmaz). Onay kutusu ikisinin de üstünde: iki yol da onay ister.
            */}
            <div className="signup-account-panel mb-4 space-y-4">
              {/*
                Uyum paketi (7 Kasım 2026): aydınlatma bir onay değil bilgilendirmedir ("okudum ve anladım"),
                koşullar kabul edilir; iki kutu ayrı. İkisi de metni açıp sonuna kadar okumadan işaretlenmez.
              */}
              <AgeDeclarationField value={age} onChange={setAge} />
              <ReadGate
                docId="kvkk_aydinlatma"
                linkText="KVKK Aydınlatma Metni"
                after="'ni okudum ve anladım."
                ariaLabel="KVKK Aydınlatma Metni'ni okudum ve anladım"
                checked={kvkkRead.checked}
                onChange={setKvkkRead}
              />
              <ReadGate
                docId="kullanim_kosullari"
                linkText="Kullanım Koşulları"
                after="'nı okudum ve kabul ediyorum."
                ariaLabel="Kullanım Koşulları'nı okudum ve kabul ediyorum"
                checked={termsRead.checked}
                onChange={setTermsRead}
              />
              <label className="cp-legal-row">
                <Checkbox
                  aria-label={MARKETING_CONSENT_TEXT}
                  className="mt-0.5 size-5 border-[var(--c-text-subtle)]"
                  checked={marketing}
                  onCheckedChange={(value) => setMarketing(value === true)}
                />
                <span className="cp-legal-row-text">
                  {MARKETING_CONSENT_TEXT}
                  <span className="cp-legal-hint">{MARKETING_CONSENT_HINT}</span>
                </span>
              </label>
              {blockedApp ? (
                <GoogleBlockedNote
                  app={blockedApp}
                  className="border-[var(--mk-border)] text-[var(--mk-muted)]"
                />
              ) : (
                <>
                  <GoogleSignInButton onClick={googleSignup} disabled={loading} label="Google ile tek dokunuşla devam et" />
                  <p className="signup-or text-center text-xs text-[var(--mk-muted)]">ya da e-postanla</p>
                </>
              )}
            </div>
            <form onSubmit={submitAccount} className="signup-account-panel space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Ad soyad</Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Adın ve soyadın"
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

              <button
                type="submit"
                disabled={loading}
                className={blockedApp ? "signup-continue w-full" : "mk-btn-outline w-full py-3 text-sm font-semibold"}
              >
                {loading ? "Oluşturuluyor…" : "E-postayla hesabı oluştur"}
              </button>
            </form>
            <PreviewLessonLink />
          </StepShell>
        ) : null}
      </div>
    </SignupPremiumShell>
  );
}

function PreviewLessonLink() {
  return (
    <p className="mt-4 text-center text-sm">
      <Link
        href="/ornek"
        className="text-[var(--cx-muted)] underline-offset-4 hover:text-[var(--cx-gold-hover)] hover:underline"
      >
        Önce örnek bir dersi incele →
      </Link>
    </p>
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
        <p className="mt-2 text-sm text-[var(--cx-muted)]">{subtitle}</p>
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
  suggested = false,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  showCheck?: boolean;
  /** Hedef kitle sekmesinin önerdiği seçenek: kesikli çerçeve, seçilmiş sayılmaz. */
  suggested?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
      data-selected={selected}
      data-suggested={suggested || undefined}
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
  suggested,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  suggested?: boolean;
}) {
  return (
    <SignupChoice
      selected={selected}
      suggested={suggested}
      onClick={onClick}
      className="px-3 py-3 text-center text-sm font-medium"
      ariaLabel={label}
      showCheck={false}
    >
      {label}
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
