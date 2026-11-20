import { FREE_CHAT_PER_DAY, FREE_PHOTO_PER_MONTH } from "@/lib/billing/free-meters";
import { FREE_FIRST_LESSON_SENTENCE, FREE_PAGE_TOTAL, PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";
import type { EmailCategory } from "@/lib/notifications/dispatch-guard";
import {
  count,
  formatCount,
  properName,
  renderMail,
  trimOrigin,
  type FooterVariant,
  type MailBlock,
  type RenderedMail,
} from "@/lib/email/templates/layout";

/*
  Hoş geldin (işlem e-postası): kayıt tamamlanınca bir kez. Ücretsiz katmanın her sayısı sabitlerden gelir
  (`free-tier-copy.ts`, `free-meters.ts`); ilk hazırlığın ilk dersi süre sınırı olmadan açık, devamı Plus'ta.
*/

export const TEMPLATE_KEY = "welcome_onboarding" as const;
export const TEMPLATE_CATEGORY = "transactional" satisfies EmailCategory;
export const TEMPLATE_FOOTER = "transactional" satisfies FooterVariant;

export type WelcomeOnboardingInput = {
  firstName: string | null;
  origin: string;
  /** Şifreyle açılmış ve e-postası henüz doğrulanmamış hesap. */
  unverified: boolean;
  daysToExam?: number | null;
};

export function renderWelcomeOnboarding(input: WelcomeOnboardingInput): RenderedMail {
  const origin = trimOrigin(input.origin);
  const name = properName(input.firstName);
  const subject = name
    ? `Hoş geldin ${name}! İlk sınav yolunu 2 dakikada kuralım`
    : "Hoş geldin! İlk sınav yolunu 2 dakikada kuralım";
  const days = typeof input.daysToExam === "number" && Number.isFinite(input.daysToExam) ? count(input.daysToExam) : 0;

  const blocks: MailBlock[] = [
    {
      type: "paragraph",
      text: "Cortex Plus, ders notundan ya da hazır müfredattan sana özel bir sınav yolu kurar: konu anlatımı, test, kartlar ve tekrar aynı yolda, sınav tarihine göre planlanır.",
    },
    ...(days >= 1
      ? [{ type: "note", lead: `Sınavına ${formatCount(days)} gün var.`, text: "Yolunu bu tarihe göre kurarız; her gün sıradaki adımı gösteririz." } as const]
      : []),
    ...(input.unverified
      ? [
          {
            type: "note",
            tone: "warm",
            lead: "E-postanı doğrula.",
            text: "Ayrıca gönderdiğimiz doğrulama bağlantısına tıklaman yeter; gelmediyse spam klasörüne de bak.",
          } as const,
        ]
      : []),
    { type: "note", tone: "warm", text: FREE_FIRST_LESSON_SENTENCE },
    { type: "heading", text: "Ücretsiz hesabında" },
    {
      type: "list",
      items: [
        `Günde ${formatCount(FREE_CHAT_PER_DAY)} öğretmen mesajı`,
        `Ayda ${formatCount(FREE_PHOTO_PER_MONTH)} fotoğraftan soru çözümü`,
        `Tek sınav hazırlığı ve toplam ${formatCount(FREE_PAGE_TOTAL)} sayfa belge`,
      ],
    },
    { type: "paragraph", text: `${PLUS_ONLY_SENTENCE} İlk dersten sonraki konular da Plus'ta açılır; acelesi yok, önce ilk dersini dene.` },
    { type: "heading", text: "Üç adımda başla" },
    {
      type: "steps",
      items: [
        {
          title: "Sınavını ve dersini seç",
          line: 'Notunu yükle (PDF, fotoğraf, Word ya da slayt) ya da "Belgem yok" ile hazır müfredattan başla; konular resmî MEB / ÖSYM programından gelir.',
        },
        { title: "İlk dersi aç", line: "Konu anlatımı kısa ekranlarla ilerler; arada küçük sorularla kendini yoklarsın." },
        {
          title: "Soru çöz, tekrarla",
          line: "Konu testi, doğru/yanlış ve kartlarla pekiştir; yanlışların günü gelince yeniden karşına çıkar.",
        },
      ],
    },
  ];

  return renderMail({
    subject,
    preheader: FREE_FIRST_LESSON_SENTENCE,
    kicker: "Hoş geldin",
    headline: name ? `Aramıza hoş geldin, ${name}` : "Aramıza hoş geldin",
    greetingName: name,
    blocks,
    cta: { label: "İlk hazırlığını kur", href: `${origin}/deneme-sinavlari/olustur` },
    footer: { variant: "transactional" },
  });
}
