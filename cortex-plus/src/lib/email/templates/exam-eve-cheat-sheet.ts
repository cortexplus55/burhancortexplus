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
  Sınava 48 ve 24 saat kala (yaşam döngüsü). Sınav sabahı kâğıdı Plus'ta (`sinav-sabahi/page.tsx`, `plusOnlyLocked`):
  `cramSheetAvailable` yalnız kâğıdı açabilen öğrencide doğru gelir; değilse e-posta kâğıttan hiç söz etmez, günü
  gelen tekrara götürür.
*/

export const TEMPLATE_KEY = "exam_eve_cheat_sheet" as const;
export const TEMPLATE_CATEGORY = "lifecycle" satisfies EmailCategory;
export const TEMPLATE_FOOTER = "lifecycle" satisfies FooterVariant;

export type ExamEveCheatSheetInput = {
  firstName: string | null;
  prepTitle: string;
  hoursLeft: 48 | 24;
  learnedTopics: number;
  totalTopics: number;
  /** En zayıf konular; en çok üçü gösterilir. */
  weakestTopics: string[];
  cramSheetAvailable: boolean;
  prepId: string;
  origin: string;
  preferencesUrl: string;
};

export function renderExamEveCheatSheet(input: ExamEveCheatSheetInput): RenderedMail {
  const origin = trimOrigin(input.origin);
  const name = properName(input.firstName);
  const hoursLeft = input.hoursLeft === 24 ? 24 : 48;
  const prepTitle = subjectPart(input.prepTitle) || "Sınav hazırlığın";
  const total = count(input.totalTopics);
  const learned = Math.min(total, count(input.learnedTopics));
  const weakest = (input.weakestTopics ?? []).map((topic) => subjectPart(topic)).filter(Boolean).slice(0, 3);
  const prepPath = `${origin}/deneme-sinavlari/${encodeURIComponent(input.prepId)}`;
  const sheet = input.cramSheetAvailable === true;

  const subject = sheet
    ? `Sınavına ${hoursLeft} saat kaldı! Sınav Sabahı 15 Dk Özet & Formül Kağıdın hazır`
    : `Sınavına ${hoursLeft} saat kaldı! Son tekrarın hazır`;

  const blocks: MailBlock[] = [
    {
      type: "paragraph",
      text: `"${prepTitle}" için son düzlüğe geldin. Bu saatlerde yeni konu açmak yerine bildiklerini sağlamlaştırmak en verimli yol.`,
    },
    ...(total > 0
      ? [{ type: "stats", items: [{ value: `${formatCount(learned)}/${formatCount(total)}`, label: "konu öğrenildi" }] } as const]
      : []),
    ...(weakest.length
      ? [{ type: "heading", text: "Önce bunlara bak" } as const, { type: "list", items: weakest } as const]
      : []),
    sheet
      ? {
          type: "note",
          lead: "Sınav Sabahı kâğıdın hazır.",
          text: "Kayıtlı derslerinden derlenir: formüller, sınav tuzakları ve en çok yanıldığın noktalar tek sayfada. Yazdırabilir ya da PDF olarak kaydedebilirsin.",
        }
      : {
          type: "note",
          lead: "Son tekrarın hazır.",
          text: "Günü gelen tekrar sorularını ve yanlışlarını bugün kapat; tekrar hakkından düşmez.",
        },
  ];

  return renderMail({
    subject,
    preheader: total > 0 ? `${formatCount(learned)}/${formatCount(total)} konu öğrenildi. Son adım seni bekliyor.` : "Son adım seni bekliyor.",
    kicker: prepTitle,
    headline: `Sınavına ${hoursLeft} saat kaldı`,
    greetingName: name,
    blocks,
    cta: sheet
      ? { label: "Kağıdı aç (PDF olarak kaydedebilirsin)", href: `${prepPath}/sinav-sabahi` }
      : { label: "Son tekrarı aç", href: `${prepPath}/tekrar` },
    footer: { variant: "lifecycle", preferencesUrl: input.preferencesUrl },
  });
}
