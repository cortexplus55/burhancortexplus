import { MarketingPage } from "@/components/layout/marketing-page";
import { MarketingOffButton } from "@/components/notifications/marketing-off-button";
import {
  NotificationPreferencesPanel,
  type PanelPreferences,
} from "@/components/notifications/notification-preferences-panel";
import "@/styles/notification-preferences.css";

/**
 * E-postadaki bağlantının açtığı tercih sayfasının gövdesi (Faz 6, 20 Kasım 2026). Pazarlama kabuğu her temada koyu;
 * panel bu yüzden koyu token'larla çizilir (`dark` kapsayıcı), sitenin teması açık olsa da okunur.
 */
export function GuestPreferencesView({
  token,
  preferences,
  marketingOn,
}: {
  token: string;
  preferences: PanelPreferences;
  marketingOn: boolean;
}) {
  return (
    <MarketingPage
      title="Bildirim ve e-posta tercihleri"
      description="Hangi hatırlatmaları alacağını buradan seçebilirsin. Hesabınla ilgili bilgilendirmeler (doğrulama, ödeme, iade) her zaman gelir."
      variant="legal"
    >
      <div className="dark cx-np-guest max-w-xl">
        <NotificationPreferencesPanel initial={preferences} mode={{ kind: "token", token }} showAllOff />
        <div className="cx-np-guest-marketing">
          <MarketingOffButton token={token} initiallyOn={marketingOn} />
        </div>
      </div>
    </MarketingPage>
  );
}
