import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { guestLimit } from "@/lib/api/guards";
import { passwordIssues } from "@/lib/auth/password";
import {
  ALIAS_EMAIL_MESSAGE,
  DISPOSABLE_EMAIL_MESSAGE,
  emailDomain,
  isDisposableEmail,
} from "@/lib/auth/email-policy";
import { UNVERIFIED_FLAG, sendVerification } from "@/lib/auth/email-verification";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { ageDeclarationSchema, ageProblem, consentEvidenceSchema } from "@/lib/legal/consent-evidence";
import { recordSignupConsent } from "@/lib/legal/record-consent";
import { recordSignupMarketingConsent } from "@/lib/email/preferences";

export const dynamic = "force-dynamic";

/** Bir IP'den 10 dakikada açılabilecek hesap: okulda bir sınıf aynı anda kayıt olur, bot sürüsü olmaz. */
const SIGNUP_PER_IP_10_MIN = 30;
const SIGNUP_PER_IP_DAY = 200;

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(2).max(120),
  gradeLevel: z.string().max(40).optional(),
  learningGoal: z.string().max(120).optional(),
  tutorStyle: z.string().max(40).optional(),
  avatarEmoji: z.string().max(8).optional(),
  consentAcceptedAt: z.string().max(40),
  // Uyum paketi (7 Kasım 2026): okuma kanıtı ve yaş beyanı. Eski sekmeden gelen istekte yok olabilir; o zaman
  // onay bugünkü sürüm adına yazılmaz, onay kapısı ilk girişte metinleri yeniden gösterir.
  consentEvidence: consentEvidenceSchema.optional(),
  ageDeclaration: ageDeclarationSchema.optional(),
  marketingEmail: z.boolean().optional(),
  next: z.string().max(400).optional(),
  referralCode: z.string().max(16).optional(),
});

/**
 * E-posta ve şifreyle kayıt — "hemen gir, içeride onayla" (31 Ekim 2026, Paket J1 #1).
 *
 * Hesap Supabase'in yönetici ucuyla açılır (`email_confirm: true` + `app_metadata.email_unverified`): öğrenci
 * doğrulama ekranında beklemeden istemcide şifresiyle girer; doğrulama bağlantısı bizim posta hattımızdan gider.
 * Doğrulanmamış hesap ürünü kullanır ama davet hediyesi almaz (SQL `account_verified`). Tek kullanımlık adres ve
 * aynı Gmail kutusunun başka yazımı burada reddedilir (eskiden yalnız istemcide uyarılıyordu; artık kapıda
 * doğrulama yok, kalkan sunucuda olmalı).
 *
 * 5xx dönerse istemci eski yola (`supabase.auth.signUp` + doğrulama ekranı) düşer: kayıt hiçbir koşulda
 * kapanmaz.
 */
export async function POST(request: Request) {
  const burst = await guestLimit(request, { scope: "signup", limit: SIGNUP_PER_IP_10_MIN, windowSeconds: 600 });
  if (burst) return burst;
  const daily = await guestLimit(request, { scope: "signup-day", limit: SIGNUP_PER_IP_DAY, windowSeconds: 86_400 });
  if (daily) return daily;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bilgiler geçersiz." }, { status: 400 });
  const input = parsed.data;
  const email = input.email.toLowerCase();

  const issue = passwordIssues(input.password)[0];
  if (issue) return NextResponse.json({ error: issue }, { status: 400 });
  // 18 yaşından küçük beyan edildiyse velinin izni şart; arayüz de aynı cümleyle durur.
  if (input.ageDeclaration) {
    const ageIssue = ageProblem(input.ageDeclaration);
    if (ageIssue) return NextResponse.json({ error: ageIssue }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: blockedRows } = await service
    .from("blocked_email_domains")
    .select("domain")
    .eq("domain", emailDomain(email))
    .limit(1);
  if (isDisposableEmail(email) || (blockedRows ?? []).length > 0) {
    return NextResponse.json({ error: DISPOSABLE_EMAIL_MESSAGE }, { status: 400 });
  }
  const { data: aliasTaken } = await service.rpc("email_alias_taken", { p_email: email });
  if (aliasTaken === true) return NextResponse.json({ error: ALIAS_EMAIL_MESSAGE }, { status: 409 });

  const { data, error } = await service.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    app_metadata: { [UNVERIFIED_FLAG]: true },
    user_metadata: {
      full_name: input.fullName,
      primary_role: "student",
      grade_level: input.gradeLevel ?? "",
      learning_goal: input.learningGoal ?? "",
      tutor_style: input.tutorStyle ?? "step_by_step",
      avatar_emoji: input.avatarEmoji ?? "",
      onboarding_done: "false",
      legal_consent_at: input.consentAcceptedAt,
      legal_consent_evidence: input.consentEvidence ?? null,
      age_declaration: input.ageDeclaration ?? null,
      marketing_email: input.marketingEmail === true,
      signup_next: safeNextPath(input.next ?? null, ""),
      referral_code: input.referralCode ?? "",
    },
  });
  if (error || !data.user) {
    const text = `${error?.message ?? ""} ${(error as { code?: string } | null)?.code ?? ""}`;
    if (/already|registered|exists|email_exists/i.test(text)) {
      return NextResponse.json({ error: "Bu e-posta zaten kayıtlı. Giriş yap veya şifreni sıfırla." }, { status: 409 });
    }
    console.error("signup_create_failed", { status: (error as { status?: number } | null)?.status ?? null });
    return NextResponse.json({ error: "Kayıt şu an tamamlanamadı.", fallback: true }, { status: 503 });
  }

  const user = data.user;
  // Onay kaydı hesapla aynı anda (profil satırını auth tetikleyicisi açar): tamamla sayfasına ulaşılamasa da
  // kanıt kaybolmaz. Yazılamazsa kayıt yine biter; tamamlama ve onay kapısı eksiği kapatır.
  await recordSignupConsent(service, {
    userId: user.id,
    acceptedAt: input.consentAcceptedAt,
    ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    documents: input.consentEvidence ?? null,
    age: input.ageDeclaration ?? null,
  }).catch((error: unknown) => {
    console.error("signup_consent_record_failed", { userId: user.id, error: String(error) });
  });
  // Kampanya e-postası izni (işaretlendiyse): hesapla aynı anda, kanıtıyla. Yazılamazsa kayıt yine biter.
  if (input.marketingEmail) {
    await recordSignupMarketingConsent(service, user.id, request.headers.get("x-forwarded-for")).catch(() => undefined);
  }
  // Posta yanıtı bekletmesin: öğrenci hemen içeri girer, e-posta arkadan gider.
  after(async () => {
    const sent = await sendVerification({ userId: user.id, email, name: input.fullName });
    if (!sent) console.warn("signup_verify_mail_failed", { userId: user.id });
  });
  return NextResponse.json({ ok: true });
}
