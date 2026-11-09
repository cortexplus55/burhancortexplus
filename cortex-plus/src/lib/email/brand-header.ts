/**
 * E-posta logo başlığı (9 Kasım 2026: yeni 3B logo). Tablo düzeni + satır içi CSS: Gmail, Apple Mail ve
 * Outlook (Word motoru) aynı çizer. Görsel 480×134 (2x), 240×67 gösterilir; `width`/`height` öznitelikleri
 * Outlook için şart, `display:block` görselin altındaki boşluğu siler.
 *
 * Görseller opak (zemini işlenmiş): Gmail'in koyu modda renkleri çevirmesi şeffaf PNG'deki yazıyı
 * kaybettirebiliyordu. Adres mutlak ve https; yerelde ve önizlemede de canlıya gider ki posta
 * istemcisi görseli bulabilsin. Görseller kapalıyken `alt` bant renginin zıddıyla "Cortex Plus" yazar.
 */
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const TONES = {
  /** `mailer.ts` → `layout()` (koyu kabuk). Görselin zemini #0B0D12. */
  dark: { src: "https://cortexplus.app/email/logo-email.png", band: "#0B0D12", alt: "#ffffff" },
  /** `templates.ts` → `emailShell()` (açık kabuk). Görselin zemini beyaz. */
  light: { src: "https://cortexplus.app/email/logo-email-white.png", band: "#ffffff", alt: "#111827" },
} as const;

export const EMAIL_LOGO_URLS = { dark: TONES.dark.src, light: TONES.light.src } as const;

export function emailBrandHeader(tone: keyof typeof TONES): string {
  const { src, band, alt } = TONES[tone];
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${band}" ` +
    `style="width:100%;background-color:${band};border-radius:16px;border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;">` +
    `<tr><td align="center" valign="middle" bgcolor="${band}" style="padding:16px 24px;background-color:${band};border-radius:16px;">` +
    `<img src="${src}" width="240" height="67" alt="Cortex Plus" border="0" ` +
    `style="display:block;width:240px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;` +
    `color:${alt};font:700 20px/67px ${FONT};text-align:center;">` +
    `</td></tr></table>`
  );
}
