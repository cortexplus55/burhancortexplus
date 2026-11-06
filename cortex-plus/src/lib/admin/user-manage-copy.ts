/*
  Kullanıcı yönetiminin saf parçaları (6 Kasım 2026): onay sözcüğü, paket süresinin cüzdana yansıması,
  hedef hesap kuralı, durum adları. Veritabanı yok; istemci bileşenleri de okur. Yazımlar `user-manage.ts`'te.
*/

/** Kalıcı silmede yazdırılan sözcük. Büyük-küçük harf ve İ/I farkı yok sayılır ("sil", "SIL" de olur). */
export const DELETE_CONFIRM_WORD = "SİL";

const foldDotted = (text: string) => text.trim().toLocaleUpperCase("tr").replace(/İ/g, "I");

export function deleteConfirmationMatches(text: string | null | undefined): boolean {
  return foldDotted(text ?? "") === foldDotted(DELETE_CONFIRM_WORD);
}

/** Bir seferde silinebilecek en çok kayıt (yanlışlıkla bütün hesabı boşaltmasın; gerekirse ikinci tur). */
export const DELETE_BATCH_MAX = 50;

/** Paket tanımlamada gün sınırı. */
export const GRANT_DAYS_MIN = 1;
export const GRANT_DAYS_MAX = 365;

/** Tek seferde eklenip düşülebilecek yıldız (SQL `admin_adjust_stars` ile aynı sınır). */
export const STAR_ADJUST_MAX = 5000;

export type GrantablePlanRow = {
  id: string;
  slug: string;
  name: string | null;
  tier: string | null;
  is_premium: boolean | null;
  active: boolean | null;
  billing_period: string | null;
  monthly_allowance: number | null;
};

const PLAN_GRANT_LABEL: Record<string, string> = {
  "plus-aylik": "Plus (aylık)",
  "plus-haftalik": "Sınav Haftası (haftalık Plus)",
  "sigma-aylik": "Sigma (aylık)",
};

/** Tanımlanabilen plan: satışta, ücretli kademe (Plus ya da Sigma). Ek kredi paketleri dönem açmaz. */
export function isGrantablePlan(plan: GrantablePlanRow | null | undefined): plan is GrantablePlanRow {
  if (!plan || !plan.active || !plan.is_premium) return false;
  const tier = (plan.tier ?? "").toLowerCase();
  return tier === "plus" || tier === "sigma";
}

export function grantPlanLabel(plan: Pick<GrantablePlanRow, "slug" | "name">): string {
  return PLAN_GRANT_LABEL[plan.slug] ?? plan.name ?? "Plan";
}

/** Sigma önce, sonra aylık Plus, sonra haftalık. */
export function grantablePlanOptions(plans: readonly GrantablePlanRow[]): { id: string; label: string }[] {
  const rank = (plan: GrantablePlanRow) =>
    (plan.tier === "sigma" ? 0 : 10) + (plan.billing_period === "weekly" ? 1 : 0);
  return plans
    .filter(isGrantablePlan)
    .sort((a, b) => rank(a) - rank(b))
    .map((plan) => ({ id: plan.id, label: grantPlanLabel(plan) }));
}

const DAY_MS = 86_400_000;

/**
 * Tanımlanan sürenin cüzdana yansıması. PayTR geri çağrısı ve beta kodu ile aynı kural:
 * dönem penceresi haftalıkta 7, öbürlerinde 30 gün. Süre pencereden kısaysa hak gün sayısıyla orantılı ve
 * cüzdan dönemi aboneliğin bitişinde biter (beta kodu: 14 gün = 7.200 × 14 / 30); değilse pencerenin tam hakkı,
 * dönem bugünün başından pencere kadar (PayTR); sonraki dönemleri `credit_reserve` aboneliğe bakarak yeniler.
 */
export function planGrantWallet(input: {
  billingPeriod: string | null;
  monthlyAllowance: number | null;
  days: number;
  subscriptionEnd: Date;
  now: Date;
}): { allowance: number; periodKind: "weekly" | "monthly"; periodEndsAt: string } {
  const weekly = input.billingPeriod === "weekly";
  const window = weekly ? 7 : 30;
  const full = input.monthlyAllowance && input.monthlyAllowance > 0 ? input.monthlyAllowance : 7200;
  const periodKind = weekly ? "weekly" : "monthly";
  if (input.days < window) {
    return {
      allowance: Math.max(1, Math.round((full * input.days) / window)),
      periodKind,
      periodEndsAt: input.subscriptionEnd.toISOString(),
    };
  }
  const dayStart = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate());
  return { allowance: full, periodKind, periodEndsAt: new Date(dayStart + window * DAY_MS).toISOString() };
}

/** Dönemin yeni bitişi: süren dönem varsa onun sonundan, yoksa şimdiden. */
export function grantPeriodEnd(currentEnd: string | null | undefined, days: number, now: Date): Date {
  const end = currentEnd ? new Date(currentEnd).getTime() : 0;
  return new Date(Math.max(now.getTime(), Number.isFinite(end) ? end : 0) + days * DAY_MS);
}

export type ActorRole = "founder" | "admin";

/**
 * Hedef hesap kuralı. Yönetici, bir yöneticinin ya da kurucunun hesabında değişiklik yapamaz (askıya alma ile
 * aynı kural); kurucu başka bir kurucunun içeriğini silemez. Kurucu kendi hesabında her şeyi yapabilir.
 */
export function targetAccountProblem(input: {
  actorId: string;
  actorRole: ActorRole;
  targetId: string;
  targetRoles: readonly string[];
  destructive?: boolean;
}): string | null {
  const targetFounder = input.targetRoles.includes("founder");
  const targetAdmin = targetFounder || input.targetRoles.includes("admin");
  if (input.actorId === input.targetId) return null;
  if (targetAdmin && input.actorRole !== "founder") {
    return "Bir yöneticinin ya da kurucunun hesabında bu işlemi yalnız kurucu yapabilir.";
  }
  if (targetFounder && input.destructive) return "Başka bir kurucunun içeriği buradan silinemez.";
  return null;
}

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  uploading: "Yükleniyor",
  uploaded: "Yüklendi",
  queued: "Sırada",
  pending: "Sırada",
  processing: "İşleniyor",
  extracting: "Okunuyor",
  completed: "Hazır",
  failed: "Okunamadı",
};

export function documentStatusLabel(status: string | null | undefined): string {
  return (status && DOCUMENT_STATUS_LABEL[status]) || "Bilinmiyor";
}

export function documentStatusTone(status: string | null | undefined): "ok" | "warn" | "bad" | "mute" {
  if (status === "completed") return "ok";
  if (status === "failed") return "bad";
  if (status && status in DOCUMENT_STATUS_LABEL) return "warn";
  return "mute";
}

export function formatFileSize(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}

/** E-posta durumu: bayrak ya da Supabase'in onay tarihi yoksa onaysız. */
export function emailVerifiedState(user: {
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
} | null | undefined): "verified" | "unverified" | "unknown" {
  if (!user) return "unknown";
  if (user.app_metadata?.email_unverified === true) return "unverified";
  return user.email_confirmed_at ? "verified" : "unverified";
}

/** İki zamanın yenisi (son etkinlik: son giriş ya da son çalışma). */
export function latestTime(...values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms) && ms > bestMs) {
      best = value;
      bestMs = ms;
    }
  }
  return best;
}
