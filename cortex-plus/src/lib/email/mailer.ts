import "server-only";
import { createSmtpTransport, getSmtpConfig } from "@/lib/email/smtp";

type SendResult = { ok: true } | { ok: false; reason: string };

async function sendViaResend({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    return { ok: false, reason: "resend_not_configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, reason: body.slice(0, 200) || `resend_${res.status}` };
  }
  return { ok: true };
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const config = getSmtpConfig();
  if (!config) {
    return sendViaResend({ to, subject, html, text });
  }

  try {
    const transport = createSmtpTransport(config);
    await transport.sendMail({
      from: config.from,
      to,
      subject,
      html,
      text,
    });
    return { ok: true };
  } catch {
    const fallback = await sendViaResend({ to, subject, html, text });
    if (fallback.ok) return fallback;
    return { ok: false, reason: "smtp_send_failed" };
  }
}

function layout(title: string, body: string, cta?: { href: string; label: string }) {
  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;background:#0c0c0c;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#fafafa;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <p style="font-size:18px;font-weight:600;margin:0 0 24px;">Cortex Plus</p>
      <div style="background:#161616;border:1px solid #2a2a2a;border-radius:20px;padding:24px;">
        <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
        <div style="font-size:14px;line-height:1.6;color:#c9c9c9;">${body}</div>
        ${
          cta
            ? `<a href="${cta.href}" style="display:inline-block;margin-top:20px;background:#4a6cf7;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:14px;">${cta.label}</a>`
            : ""
        }
      </div>
      <p style="font-size:12px;color:#8a8a8a;margin-top:24px;">
        Bu e-postayı beklemiyorsan görmezden gelebilirsin.
      </p>
    </div>
  </body>
</html>`;
}

export async function sendParentInviteEmail({
  to,
  parentName,
  inviteCode,
}: {
  to: string;
  parentName: string;
  inviteCode?: string | null;
}) {
  const url = `${appUrl()}/kayit`;
  const codeBlock = inviteCode
    ? `<p style="margin:16px 0 0;">Bağlantı kodu: <strong style="letter-spacing:4px;">${inviteCode}</strong></p>`
    : "";

  return sendEmail({
    to,
    subject: `${parentName} seni Cortex Plus'a davet ediyor`,
    html: layout(
      "Cortex Plus daveti",
      `<p style="margin:0;"><strong>${parentName}</strong> seni Cortex Plus'a davet etti ve ilerlemeni takip etmek istiyor.</p>
       <p style="margin:12px 0 0;">Hesabını oluşturduktan sonra profilindeki veli isteğini onaylaman yeterli. Sohbet içeriklerin gizli kalır; velinle yalnızca ilerleme özetin paylaşılır.</p>${codeBlock}`,
      { href: url, label: "Hesabımı oluştur" },
    ),
    text: `${parentName} seni Cortex Plus'a davet etti. Hesap oluştur: ${url}${
      inviteCode ? ` (kod: ${inviteCode})` : ""
    }`,
  });
}

export async function sendParentRequestEmail({
  to,
  parentName,
}: {
  to: string;
  parentName: string;
}) {
  const url = `${appUrl()}/profil`;
  return sendEmail({
    to,
    subject: "Yeni veli bağlantı isteği",
    html: layout(
      "Veli bağlantı isteği",
      `<p style="margin:0;"><strong>${parentName}</strong> hesabına veli olarak bağlanmak istiyor.</p>
       <p style="margin:12px 0 0;">İsteği onaylarsan ilerleme özetin (deneme sonuçların ve çalışma serin) velinle paylaşılır. Sohbet içeriklerin her durumda gizli kalır.</p>`,
      { href: url, label: "İsteği görüntüle" },
    ),
    text: `${parentName} hesabına veli olarak bağlanmak istiyor. Onaylamak için: ${url}`,
  });
}
