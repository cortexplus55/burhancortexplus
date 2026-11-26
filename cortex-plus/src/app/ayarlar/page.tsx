import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BookOpenCheck,
  ChevronRight,
  CreditCard,
  FileText,
  Gauge,
  GraduationCap,
  Receipt,
  Scale,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { PLAN_WORK_BY_ID, workCount } from "@/lib/billing/plan-value";
import { PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import { AppShell } from "@/components/layout/app-shell";
import { AccountDeletionPanel } from "@/components/profile/account-deletion-panel";
import { ACCOUNT_DELETION_COPY } from "@/lib/privacy/account-deletion-copy";
import { CookiePreferencesButton } from "@/components/legal/cookie-banner";
import { EmailChangeCard } from "@/components/profile/email-change-card";
import { EmailPreferencesCard } from "@/components/profile/email-preferences-card";
import { NotificationPreferencesPanel } from "@/components/notifications/notification-preferences-panel";
import { publicPreferences } from "@/lib/notifications/preference-api";
import { loadNotificationPreferences } from "@/lib/notifications/preferences";
import { AppearanceRow } from "@/components/parity/appearance-row";
import { requireUser } from "@/lib/auth/session";
import { getSessionUserContext } from "@/lib/auth/session-context";
import { formatDate } from "@/lib/format";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { createServiceClient } from "@/lib/supabase/server";
import { FounderBadge } from "@/components/student/founder-chip";
import { DialogLink } from "@/components/parity/dialog-link";
import { WorkCapacityCard } from "@/components/profile/work-capacity-card";
import { TutorMemoryCard } from "@/components/settings/tutor-memory-card";
import "@/styles/report-card.css";

export const metadata = { title: "Ayarlar" };

/*
  Ayarlar: bütün ayarların tek adresi (8 Kasım 2026, ürün sahibi: "hangisi daha mantıklı ve premium ise").
  Önce üç yer vardı: profil sayfası, Ayarlar penceresi ve bu sayfa; tema seçimi üçünde ayrı ayrıydı. Şimdi profil
  sayfasındaki "Ayarlar" düğmesi, üst menü ve sohbetin "Tüm ayarlar"ı buraya gelir. Ad, avatar, rol, okul ve öğrenme
  tercihleri satırları düzenleme penceresini doğru sekmeyle açar (`?dialog=profile&sekme=…`).
*/
type Row = { href: string; icon: LucideIcon; title: string; hint: string };

function SettingsRows({ rows }: { rows: Row[] }) {
  return (
    <ul className="cp-set-rows">
      {rows.map(({ href, icon: Icon, title, hint }) => {
        const RowLink = href.includes("dialog=") ? DialogLink : Link;
        return (
        <li key={href}>
          <RowLink href={href} className="cp-set-row">
            <span className="cp-set-row-icon" aria-hidden>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="cp-set-row-text">
              <strong>{title}</strong>
              <span>{hint}</span>
            </span>
            <ChevronRight className="cp-set-row-chev h-4 w-4" aria-hidden />
          </RowLink>
        </li>
        );
      })}
    </ul>
  );
}

function Group({ title, description, children, tone }: { title: string; description?: string; children: React.ReactNode; tone?: "danger" }) {
  return (
    <section className={tone === "danger" ? "cp-set-group cp-set-group--danger" : "cp-set-group"}>
      <h2 className="cp-set-group-title">{title}</h2>
      {description ? <p className="cp-set-group-desc">{description}</p> : null}
      <div className="cp-set-group-body">{children}</div>
    </section>
  );
}

export default async function AyarlarPage() {
  const { supabase, user } = await requireUser();

  // Okumalar paralel (2 Kasım 2026, O12). Faz 2: plan ve kredi özeti oturum bağlamından (kabukla aynı istek içi
  // okuma); profilin iki ayrı okuması tek sorgu; kampanya izni de aynı turda (eskiden ayrı, sonraki turdaydı).
  // Faz 6 (20 Kasım 2026): bildirim tercihleri kendi deposundan (sunucu anahtarı + kullanıcı süzgeci); tablo henüz
  // yoksa depo eski hatırlatma sütununu okur. Ad, avatar, okul ve sınıf ayrı profil sorgusu yerine kabukla aynı
  // oturum bağlamından (istekte bir kez; profil güncellemesi bağlamı tazeler): sayfanın sorgu sayısı değişmedi.
  const service = createServiceClient();
  const [{ data: deletionRequest }, account, sessionContext, { data: marketingPref }, notificationPrefs] = await Promise.all([
    supabase
      .from("data_deletion_requests")
      .select("id, status, requested_at")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getStudentAccountContext(supabase, user.id),
    getSessionUserContext(user.id, { client: supabase }),
    // Kampanya izni yalnız sunucu anahtarıyla okunur (satır güvenliği tarayıcıya kapalı). 7 Kasım 2026.
    service.from("email_preferences").select("marketing").eq("user_id", user.id).maybeSingle(),
    loadNotificationPreferences(service, user.id),
  ]);
  // Okuma düşerse ad "Öğrenci" varsayılır.
  const profile = sessionContext.profile;

  const name = (profile?.full_name as string | null)?.trim() || "Öğrenci";
  const avatarRaw = (profile?.avatar_url as string | null) ?? null;
  // Avatar yalnız emoji olarak saklanıyor; adres gibi görünen eski değer baş harfe düşer.
  const avatar = avatarRaw && !/^https?:|\//.test(avatarRaw) ? avatarRaw : name.slice(0, 1).toLocaleUpperCase("tr-TR");
  const school = (profile?.school_name as string | null)?.trim() || null;
  const grade = (profile?.grade_level as string | null)?.trim() || null;
  const lessons = workCount(PLAN_ALLOWANCES.plusMonthly, PLAN_WORK_BY_ID.lesson).toLocaleString("tr-TR");
  // Faz 4 "Kalan Çalışma Kapasiten": dönem hakkından kalan + ek paket bakiyesi (harcama bu ikisinden düşer).
  const remainingCredits = Math.max(0, account.freeAllowanceRemaining) + Math.max(0, account.balance);
  const showCapacity = !account.isAdmin && (account.isPremium || remainingCredits > 0);
  const planLabel = account.isAdmin ? null : account.isPremium ? (account.subscriptionBadge ?? "Plus") : "Ücretsiz";

  return (
    <AppShell title="Ayarlar" width="read">
      <div className="cp-set-page">

        <section className="cp-set-hero" aria-label="Hesabın">
          <span className="cp-set-avatar" aria-hidden>
            {avatar}
          </span>
          <span className="cp-set-hero-text">
            <strong>{name}</strong>
            <span>{[grade, school].filter(Boolean).join(" · ") || user.email}</span>
            <span className="cp-set-hero-plan">
              {account.isAdmin ? (
                <FounderBadge />
              ) : (
                <span className={account.isPremium ? "cp-set-plan cp-set-plan--plus" : "cp-set-plan"}>{planLabel}</span>
              )}
            </span>
          </span>
          <DialogLink href="/ayarlar?dialog=profile&sekme=hesap" className="cp-set-hero-edit">
            Profili düzenle
          </DialogLink>
        </section>

        <Group title="Profil ve öğrenme">
          <SettingsRows
            rows={[
              { href: "/ayarlar?dialog=profile&sekme=hesap", icon: UserRound, title: "Ad ve avatar", hint: name },
              { href: "/ayarlar?dialog=profile&sekme=okul", icon: GraduationCap, title: "Okulum", hint: school ?? "Okulunu seç: okul sıralaması ve paylaşılan hazırlıklar" },
              { href: "/ayarlar?dialog=profile&sekme=tercihler", icon: BookOpenCheck, title: "Öğrenme tercihleri", hint: "Öğretmen stili, günlük hedef, öneriler, okuma ve ses" },
            ]}
          />
        </Group>

        {/* Öğretmen v3 (teacher.v2): öğretmen notları. Sorgu bütçesine girmez; bileşen notları açılınca uçtan ister,
            bayrak kapalıyken uç 404 döner ve bölüm hiç görünmez. */}
        <TutorMemoryCard />

        <Group
          title="Plan ve kullanım"
          description={
            account.isAdmin
              ? "Kurucu hesabında kredi sınırı yok."
              : account.isPremium
                ? "Plus aboneliğin aktif."
                : `Ücretsiz plandasın. Plus ile podcast, sözlü ve yazılı deneme, video ders ve ayda yaklaşık ${lessons} ders hakkı açılır.`
          }
        >
          {showCapacity ? <WorkCapacityCard remaining={remainingCredits} /> : null}
          <SettingsRows
            rows={[
              { href: "/krediler", icon: Gauge, title: "Kullanım limitleri", hint: "Bu ay ne kadar kullandığın" },
              ...(account.isAdmin
                ? []
                : [
                    {
                      href: "/pay",
                      icon: CreditCard,
                      title: "Abonelik",
                      hint: account.isPremium ? "Planın ve ek paketler" : "Plus'a geç",
                    },
                  ]),
              { href: "/odemeler", icon: Receipt, title: "Ödemeler", hint: "Makbuzlar ve sözleşme örnekleri" },
            ]}
          />
        </Group>

        <Group title="Görünüm" description="Uygulamanın teması. Sistem, cihazının ayarını izler.">
          <AppearanceRow />
        </Group>

        {/*
          Faz 6 (20 Kasım 2026): bildirim ve e-posta tercihlerinin tek yeri. Eski tek "Çalışma hatırlatması" anahtarı
          bu panele katıldı; kampanya izni (yasal onay kanıtıyla) kendi kartında aynen duruyor.
        */}
        <Group
          title="Bildirim ve E-Posta Tercihleri"
          description="Hesabınla ilgili bilgilendirmeler (doğrulama, ödeme, iade) her zaman gelir; aşağıdakileri istediğin gibi ayarla. Günde en fazla bir hatırlatma gönderiyoruz."
        >
          <NotificationPreferencesPanel initial={publicPreferences(notificationPrefs)} mode={{ kind: "session" }} />
          <EmailPreferencesCard initial={{ marketing: marketingPref?.marketing === true }} />
        </Group>

        <Group title="Giriş ve güvenlik" description="Giriş yaptığın adres ve şifren.">
          <EmailChangeCard
            email={user.email ?? null}
            pendingEmail={(user as { new_email?: string | null }).new_email ?? null}
            hasPasswordLogin={
              (user.identities ?? []).some((identity) => identity.provider === "email") ||
              user.app_metadata?.provider === "email"
            }
          />
        </Group>

        <Group title="Gizlilik ve yasal" description="Verilerinin nasıl işlendiğini ilgili metinlerden inceleyebilirsin.">
          <SettingsRows
            rows={[
              { href: "/gizlilik", icon: ShieldCheck, title: "Gizlilik politikası", hint: "Hangi veriyi neden tutuyoruz" },
              { href: "/kvkk", icon: FileText, title: "KVKK aydınlatma metni", hint: "Hakların ve başvuru yolu" },
              { href: "/kullanim-kosullari", icon: Scale, title: "Kullanım koşulları", hint: "Hizmetin kuralları" },
              { href: "/cerez-politikasi", icon: FileText, title: "Çerez politikası", hint: "Hangi çerezleri kullanıyoruz" },
              { href: "/destek?konu=kvkk", icon: ShieldCheck, title: "Kişisel veri başvurusu", hint: "Verilerin hakkında talep gönder" },
              { href: "#hesabi-sil", icon: Trash2, title: "Hesabımı kalıcı olarak sil", hint: "Hesabını ve verilerini sil" },
            ]}
          />
          <CookiePreferencesButton className="cp-set-inline-btn" />
        </Group>

        {/*
          Silme bir ekip işi değil: talep anında işleniyor, yarım kalırsa günlük cron yeniden deniyor
          (processPendingDeletionRequests). 26 Kasım 2026 (App Store 5.1.1(v), Google Play): kalıcı silme, silinen ve
          kalan veriler, mağaza aboneliği uyarısı; `#hesabi-sil` ile doğrudan açılır.
        */}
        <div id="hesabi-sil">
          <Group title={ACCOUNT_DELETION_COPY.groupTitle} description={ACCOUNT_DELETION_COPY.groupDescription} tone="danger">
            <AccountDeletionPanel
              request={deletionRequest ? { status: deletionRequest.status ?? null } : null}
              requestedAtLabel={deletionRequest ? formatDate(deletionRequest.requested_at) : null}
            />
          </Group>
        </div>
      </div>
    </AppShell>
  );
}
