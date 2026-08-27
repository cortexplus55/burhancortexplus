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
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!user || !pass || !from) return null;

  const port = Number(process.env.SMTP_PORT ?? "587");
  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number.isFinite(port) ? port : 587,
    user,
    pass,
    from,
  };
}

export function createSmtpTransport(config: SmtpConfig) {
  const secure = config.port === 465;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    auth: { user: config.user, pass: config.pass },
  });
}
