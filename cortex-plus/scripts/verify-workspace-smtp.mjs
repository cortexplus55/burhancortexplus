/**
 * Workspace SMTP bağlantı testi (yerel).
 * Kullanım: npx dotenv -e .env.local -- node scripts/verify-workspace-smtp.mjs
 * Şifreyi terminale yapıştırmayın; .env.local kullanın.
 */
import nodemailer from "nodemailer";

const pass = process.env.SMTP_PASS?.trim();
const from = process.env.EMAIL_FROM?.trim();
if (!pass || !from) {
  console.error("SMTP_PASS ve EMAIL_FROM gerekli (.env.local veya ortam).");
  process.exit(1);
}

const port = Number(process.env.SMTP_PORT ?? "587");
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
  port: Number.isFinite(port) ? port : 587,
  secure: port === 465,
  auth: {
    user: process.env.SMTP_USER?.trim() || "cortexplus@cortexplus.app",
    pass,
  },
});

try {
  await transport.verify();
  console.log("SMTP_VERIFY_OK");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("SMTP_VERIFY_FAIL:", msg.slice(0, 200));
  process.exit(1);
}
