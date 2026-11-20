import { PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";
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
  Ücretsiz hesabın ilk konusu bitince (yaşam döngüsü, kampanya altbilgisi): yalnız kampanya iletilerine izin veren
  öğrenciye gider; Plus'a davet eder. Kalan konular Plus'ta (`free-topic-gate.ts`). Veli bağlantısının süresi
  bağlantıyı imzalayan sabitten okunur (`PARENT_LINK_TTL_MS`), elle yazılmaz.
*/

export const TEMPLATE_KEY = "free_first_unit_completed" as const;
export const TEMPLATE_CATEGORY = "lifecycle" satisfies EmailCategory;
export const TEMPLATE_FOOTER = "marketing" satisfies FooterVariant;

export type FreeFirstUnitCompletedInput = {
  firstName: string | null;
  prepTitle: string;
  masteryPct: number;
  remainingUnits: number;
  origin: string;
  preferencesUrl: string;
};

export function renderFreeFirstUnitCompleted(input: FreeFirstUnitCompletedInput): RenderedMail {
  const origin = trimOrigin(input.origin);
  const name = properName(input.firstName);
  const pct = Math.min(100, count(input.masteryPct));
  const remaining = count(input.remainingUnits);
  const prepTitle = subjectPart(input.prepTitle) || "Sınav hazırlığın";
  const subject =
    remaining > 0
      ? `1. konuyu %${pct} ile bitirdin! Kalan ${formatCount(remaining)} konun hazır`
      : `1. konuyu %${pct} ile bitirdin!`;

  const blocks: MailBlock[] = [
    { type: "paragraph", text: `"${prepTitle}" hazırlığında 1. konuyu %${pct} hâkimiyetle tamamladın. Emeğin yerini buldu.` },
    {
      type: "stats",
      items: [
        { value: `%${pct}`, label: "1. konuda hâkimiyet" },
        ...(remaining > 0 ? [{ value: formatCount(remaining), label: "konu yolunda bekliyor" }] : []),
      ],
    },
    {
      type: "paragraph",
      text: `${remaining > 0 ? "Kalan konuların Plus'ta açılır. " : ""}${PLUS_ONLY_SENTENCE} Otomatik çekim yapılmaz; dönem bitince kendiliğinden yenilenmez.`,
    },
    {
      type: "note",
      text: `Kartın yoksa veline şifresiz, hesap açmadan WhatsApp ile ödeme bağlantısı gönderebilirsin (bağlantı ${durationLabel(PARENT_LINK_TTL_MS)} geçerli).`,
    },
  ];

  return renderMail({
    subject,
    preheader: remaining > 0 ? `${prepTitle}: kalan ${formatCount(remaining)} konun yolunda seni bekliyor.` : `${prepTitle}: ilk konun tamam.`,
    kicker: "1. konu tamam",
    headline: name ? `Tebrikler ${name}, ilk konunu bitirdin` : "Tebrikler, ilk konunu bitirdin",
    greetingName: name,
    blocks,
    cta: { label: "Plus'a bak", href: `${origin}/pay` },
    footer: { variant: "marketing", preferencesUrl: input.preferencesUrl },
  });
}
