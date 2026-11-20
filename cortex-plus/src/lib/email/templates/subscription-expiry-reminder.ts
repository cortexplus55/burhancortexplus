import { longDate } from "@/lib/email/lifecycle-templates";
import type { EmailCategory } from "@/lib/notifications/dispatch-guard";
import { PARENT_LINK_TTL_MS } from "@/lib/payments/parent-link";
import {
  count,
  durationLabel,
  formatCount,
  properName,
  renderMail,
  subjectPart,
  trimOrigin,
  type FooterVariant,
  type MailBlock,
  type RenderedMail,
} from "@/lib/email/templates/layout";

/*
  Dönem bitişi hatırlatması (yaşam döngüsü): 3 gün ve 24 saat kala. Otomatik yenileme yok
  (`AUTO_RENEW_SUPPORTED = false`); yenilemeyen öğrenci ücretsiz hesaba döner, kayıtlı içeriği açık kalır
  (`node/start.ts`, "Tekrar incele" kapıdan önce). Bu dönemin sayıları sıfırsa yazılmaz.
*/

export const TEMPLATE_KEY = "subscription_expiry_reminder" as const;
export const TEMPLATE_CATEGORY = "lifecycle" satisfies EmailCategory;
export const TEMPLATE_FOOTER = "lifecycle" satisfies FooterVariant;

export type SubscriptionExpiryReminderInput = {
  firstName: string | null;
  planName: string;
  window: "3d" | "24h";
  /** Dönemin bittiği an (ISO). */
  periodEnd: string;
  learnedTopics: number;
  completedSteps: number;
  origin: string;
  preferencesUrl: string;
};

export function renderSubscriptionExpiryReminder(input: SubscriptionExpiryReminderInput): RenderedMail {
  const origin = trimOrigin(input.origin);
  const name = properName(input.firstName);
  const planName = subjectPart(input.planName, 60) || "Plus";
  const timeLeft = input.window === "24h" ? "24 saat" : "3 gün";
  const end = longDate(input.periodEnd);
  const learned = count(input.learnedTopics);
  const steps = count(input.completedSteps);
  const stats = [
    ...(learned > 0 ? [{ value: formatCount(learned), label: "konu öğrendin" }] : []),
    ...(steps > 0 ? [{ value: formatCount(steps), label: "adım tamamladın" }] : []),
  ];

  const blocks: MailBlock[] = [
    {
      type: "paragraph",
      text: end
        ? `${planName} dönemin ${end} günü bitiyor. Kartından otomatik çekim yapılmaz; devam etmek istersen yenilemeyi sen başlatırsın.`
        : `${planName} döneminin bitmesine ${timeLeft} kaldı. Kartından otomatik çekim yapılmaz; devam etmek istersen yenilemeyi sen başlatırsın.`,
    },
    ...(stats.length ? [{ type: "heading", text: "Bu dönemde" } as const, { type: "stats", items: stats } as const] : []),
    { type: "paragraph", text: "Yenilemezsen ücretsiz hesaba dönersin; çalışman ve defterin yerinde kalır." },
    {
      type: "note",
      text: `Kartın yanında değilse Abonelik sayfasından veline şifresiz, hesap açmadan WhatsApp ile ödeme bağlantısı gönderebilirsin (bağlantı ${durationLabel(PARENT_LINK_TTL_MS)} geçerli).`,
    },
  ];

  return renderMail({
    subject: `${planName} döneminin bitmesine ${timeLeft} kaldı (Kartından otomatik çekim yapılmaz)`,
    preheader: end ? `Dönemin ${end} günü bitiyor; yenilemeyi sen başlatırsın.` : "Yenilemeyi sen başlatırsın; otomatik çekim yapılmaz.",
    kicker: planName,
    headline: `Dönemin bitmesine ${timeLeft} kaldı`,
    greetingName: name,
    blocks,
    cta: { label: "Tek tıkla yenile", href: `${origin}/pay` },
    footer: { variant: "lifecycle", preferencesUrl: input.preferencesUrl },
  });
}
