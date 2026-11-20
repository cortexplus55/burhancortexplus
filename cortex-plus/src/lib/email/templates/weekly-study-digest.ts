import type { EmailCategory } from "@/lib/notifications/dispatch-guard";
import {
  count,
  formatCount,
  ownHref,
  properName,
  renderMail,
  subjectPart,
  trimOrigin,
  type FooterVariant,
  type MailBlock,
  type RenderedMail,
} from "@/lib/email/templates/layout";

/*
  Haftalık karne (yaşam döngüsü): Pazar akşamı haftanın özeti ve Pazartesi'nin ilk adımı. Sıfır olan sayı yazılmaz;
  sessiz geçen hafta suçlanmaz. Sıradaki adımın bağlantısı yalnız kendi adresimize gider.
*/

export const TEMPLATE_KEY = "weekly_study_digest" as const;
export const TEMPLATE_CATEGORY = "lifecycle" satisfies EmailCategory;
export const TEMPLATE_FOOTER = "lifecycle" satisfies FooterVariant;

export type WeeklyStudyDigestInput = {
  firstName: string | null;
  weeklyLearned: number;
  completedActivities: number;
  streakDays: number;
  /** Sıradaki adım; `href` tam adres (ya da yol). */
  nextStep: { title: string; href: string } | null;
  origin: string;
  preferencesUrl: string;
};

export function renderWeeklyStudyDigest(input: WeeklyStudyDigestInput): RenderedMail {
  const origin = trimOrigin(input.origin);
  const name = properName(input.firstName);
  const learned = count(input.weeklyLearned);
  const activities = count(input.completedActivities);
  const streak = count(input.streakDays);
  const fallback = `${origin}/deneme-sinavlari`;
  const nextTitle = input.nextStep ? subjectPart(input.nextStep.title, 120) : "";
  const ctaHref = input.nextStep ? ownHref(input.nextStep.href, origin, fallback) : fallback;

  const stats = [
    ...(learned > 0 ? [{ value: formatCount(learned), label: "yeni konu" }] : []),
    ...(activities > 0 ? [{ value: formatCount(activities), label: "tamamlanan etkinlik" }] : []),
    ...(streak > 0 ? [{ value: formatCount(streak), label: "günlük seri" }] : []),
  ];

  const summary =
    learned > 0
      ? `Bu hafta ${formatCount(learned)} yeni konu öğrendin. Emeğin karşılığını buluyor; aynı tempoyla devam.`
      : activities > 0
        ? "Bu hafta çalıştın; şimdi bu emeği bir konuyu bitirmeye çevirme zamanı."
        : "Bu hafta sessiz geçti; olur böyle. Pazartesi tek bir adımla yeniden başlayalım.";

  const blocks: MailBlock[] = [
    { type: "paragraph", text: summary },
    ...(stats.length ? [{ type: "stats", items: stats } as const] : []),
    ...(nextTitle ? [{ type: "note", lead: "Pazartesi'nin ilk adımı:", text: nextTitle } as const] : []),
  ];

  return renderMail({
    subject: learned > 0 ? `Haftalık Cortex Plus Karnen: ${formatCount(learned)} yeni konu öğrendin` : "Haftalık Cortex Plus Karnen hazır",
    preheader: nextTitle ? `Pazartesi'nin ilk adımı: ${nextTitle}` : "Haftanın özeti ve Pazartesi'nin ilk adımı.",
    kicker: "Haftalık karne",
    headline: name ? `${name}, haftanın özeti` : "Haftanın özeti",
    greetingName: name,
    blocks,
    cta: { label: "Pazartesi'nin ilk adımı", href: ctaHref },
    footer: { variant: "lifecycle", preferencesUrl: input.preferencesUrl },
  });
}
