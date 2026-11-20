import { FREE_FIRST_LESSON_SENTENCE } from "@/lib/billing/free-tier-copy";
import { WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";
import type { EmailCategory } from "@/lib/notifications/dispatch-guard";
import {
  properName,
  renderMail,
  trimOrigin,
  type FooterVariant,
  type MailBlock,
  type RenderedMail,
} from "@/lib/email/templates/layout";

/*
  Kayıttan bir gün sonra, hazırlığı olmayan öğrenciye (yaşam döngüsü): ders notu olmadan da yol kurulur. Seçeneğin
  adı sihirbazın kendi metninden okunur (`WIZARD_COPY.pickCurriculum`); ad değişirse e-posta da değişir.
*/

export const TEMPLATE_KEY = "activation_24h" as const;
export const TEMPLATE_CATEGORY = "lifecycle" satisfies EmailCategory;
export const TEMPLATE_FOOTER = "lifecycle" satisfies FooterVariant;

export type Activation24hInput = {
  firstName: string | null;
  origin: string;
  /** Altbilgideki "Bildirim tercihlerini değiştir / abonelikten çık" bağlantısı. */
  preferencesUrl: string;
};

export function renderActivation24h(input: Activation24hInput): RenderedMail {
  const origin = trimOrigin(input.origin);
  const name = properName(input.firstName);
  const blocks: MailBlock[] = [
    {
      type: "paragraph",
      text: "Ders notun elinde değilse beklemene gerek yok. Sınavını ve dersini seç; konular resmî MEB / ÖSYM programından hazır gelsin.",
    },
    {
      type: "steps",
      items: [
        { title: "Hazırlığını kurmaya başla", line: "Sınavını, dersini ve sınav tarihini seç." },
        {
          title: "Hazır müfredatı seç",
          line: `Materyal adımındaki "${WIZARD_COPY.pickCurriculum}" seçeneğine dokun; konular resmî programdan gelir, konu uydurulmaz.`,
        },
        { title: "İlk dersini aç", line: FREE_FIRST_LESSON_SENTENCE },
      ],
    },
    { type: "paragraph", text: "Notun varsa aynı ekrandan PDF, fotoğraf, Word ya da slayt olarak yükleyebilirsin." },
  ];

  return renderMail({
    subject: 'Ders notun yoksa bile "Belgem yok" ile 30 saniyede başlayabilirsin',
    preheader: "Hazır müfredattan sınav yolunu kur; ilk dersin süre sınırı olmadan ücretsiz.",
    kicker: "Başlamak için not şart değil",
    headline: "Notun yoksa da yolun hazır",
    greetingName: name,
    blocks,
    cta: { label: "Hazırlığını kur", href: `${origin}/deneme-sinavlari/olustur` },
    footer: { variant: "lifecycle", preferencesUrl: input.preferencesUrl },
  });
}
