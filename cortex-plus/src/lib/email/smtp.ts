import "server-only";
import nodemailer from "nodemailer";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export function getSmtpConfig(): SmtpConfig | null {
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!pass || !from) return null;

  const user = process.env.SMTP_USER?.trim() || "cortexplus@cortexplus.app";
  const port = Number(process.env.SMTP_PORT ?? "587");
  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number.isFinite(port) ? port : 587,
    user,
    pass,
    from,
  };
}

/**
 * Süre sınırları: SMTP sunucusu cevap vermezse nodemailer varsayılanı (2 dk bağlantı, 10 dk soket)
 * isteği fonksiyonun ömrü boyunca askıda tutuyordu. Kısa sınırla gönderim düşer, çağıran yedeğe geçer.
 */
export const SMTP_TIMEOUTS = {
  connectionTimeout: 8_000,
  greetingTimeout: 5_000,
  socketTimeout: 10_000,
} as const;

export function createSmtpTransport(config: SmtpConfig) {
  const secure = config.port === 465;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    auth: { user: config.user, pass: config.pass },
    ...SMTP_TIMEOUTS,
  });
}

export async function verifySmtpConnection(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const config = getSmtpConfig();
  if (!config) {
    return { ok: false, reason: "smtp_not_configured" };
  }

  try {
    const transport = createSmtpTransport(config);
    await transport.verify();
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "smtp_verify_failed";
    return { ok: false, reason: message.slice(0, 240) };
  }
}
