import type { EmailCategory } from "@/lib/notifications/dispatch-guard";
import {
  count,
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
  Açık kalan sınav tuzakları (yaşam döngüsü): bir konuda kapanmamış yanlışlar varken. Günü gelen tekrar hakkından
  düşmez ve model çağırmaz (kayıtlı soruların kopyası, `review-items.ts`); süre soru başına yarım dakika, en az 2 dk.
*/

export const TEMPLATE_KEY = "smart_trap_nudge" as const;
export const TEMPLATE_CATEGORY = "lifecycle" satisfies EmailCategory;
export const TEMPLATE_FOOTER = "lifecycle" satisfies FooterVariant;

export type SmartTrapNudgeInput = {
  firstName: string | null;
  prepTitle: string;
  topicTitle: string;
  mistakeCount: number;
  prepId: string;
  origin: string;
  preferencesUrl: string;
};

/** Tahmini süre (dakika): soru başına yarım dakika, en az 2. */
export function trapMinutes(mistakeCount: number): number {
  return Math.max(2, Math.ceil(count(mistakeCount) * 0.5));
}

export function renderSmartTrapNudge(input: SmartTrapNudgeInput): RenderedMail {
  const origin = trimOrigin(input.origin);
  const name = properName(input.firstName);
  const prepTitle = subjectPart(input.prepTitle) || "Sınav hazırlığın";
  const topicTitle = subjectPart(input.topicTitle) || "Bir konu";
  const mistakes = Math.max(1, count(input.mistakeCount));
  const minutes = trapMinutes(mistakes);
  const subject = `${prepTitle}: "${topicTitle}" konusunda açık kalan ${formatCount(mistakes)} sınav tuzağın var (Tekrar 0 kredi, ~${minutes} dk)`;

  const blocks: MailBlock[] = [
    {
      type: "paragraph",
      text: `"${prepTitle}" hazırlığında "${topicTitle}" konusunda yanlış yaptığın ${formatCount(mistakes)} soru henüz kapanmadı. Sınava girmeden kapatmanın en kısa yolu kısa bir tekrar turu.`,
    },
    {
      type: "stats",
      items: [
        { value: formatCount(mistakes), label: "açık tuzak" },
        { value: `~${minutes} dk`, label: "tahmini süre" },
      ],
    },
    {
      type: "paragraph",
      text: "Tekrar hakkından düşmez ve yeni soru üretmez: yanlış yaptığın soruları yeniden çözersin, şıklar başka sırayla gelir.",
    },
  ];

  return renderMail({
    subject,
    preheader: `"${topicTitle}" konusunda ${formatCount(mistakes)} soru seni bekliyor; yaklaşık ${minutes} dakika.`,
    kicker: "Açık kalan tuzaklar",
    headline: `"${topicTitle}" konusunda ${formatCount(mistakes)} tuzak seni bekliyor`,
    greetingName: name,
    blocks,
    cta: { label: "Tuzakları kapat", href: `${origin}/deneme-sinavlari/${encodeURIComponent(input.prepId)}/tekrar` },
    footer: { variant: "lifecycle", preferencesUrl: input.preferencesUrl },
  });
}
