import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";
import { GuestPreferencesView } from "@/components/notifications/guest-preferences-view";
import { publicPreferences } from "@/lib/notifications/preference-api";
import { INVALID_PREFERENCE_LINK } from "@/lib/notifications/preference-copy";
import { preferencesByToken } from "@/lib/notifications/preferences";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Bildirim tercihleri",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * E-postadaki "bildirim tercihleri" bağlantısının sayfası (Faz 6, 20 Kasım 2026). Oturum gerekmez: anahtar
 * (`user_notification_preferences.unsubscribe_token`) hesabı belirler. Sayfayı açmak hiçbir şeyi değiştirmez (posta
 * uygulamaları bağlantıları önceden açar); değişiklik yalnız düğmeyle (`POST /api/bildirim-tercihleri`, kampanya için
 * tek tık ucu). Geçersiz ya da eksik anahtarda yalnız "bağlantı geçersiz" yazılır, başka bir şey söylenmez.
 */
export default async function BildirimTercihleriPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const service = token ? createServiceClient() : null;
  const owner = service ? await preferencesByToken(service, token) : null;

  if (!service || !owner) {
    return (
      <MarketingPage title={INVALID_PREFERENCE_LINK} variant="legal">
        <div className="mk-card max-w-xl space-y-5 p-6">
          <p className="text-sm leading-relaxed text-[var(--mk-muted)]">
            Bağlantı eksik ya da bozulmuş olabilir. Giriş yapıp tercihlerini Ayarlar&apos;dan değiştirebilirsin.
          </p>
          <Link
            href="/giris?next=%2Fayarlar"
            className="mk-btn-primary inline-flex min-h-11 items-center justify-center px-8 py-3 text-sm font-semibold"
          >
            Giriş yap
          </Link>
        </div>
      </MarketingPage>
    );
  }

  const { data: marketingRow } = await service
    .from("email_preferences")
    .select("marketing")
    .eq("user_id", owner.userId)
    .maybeSingle();

  return (
    <GuestPreferencesView
      token={token}
      preferences={publicPreferences(owner.preferences)}
      marketingOn={marketingRow?.marketing === true}
    />
  );
}
