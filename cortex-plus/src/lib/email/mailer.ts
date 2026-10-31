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
      // DELIVERABILITY P1 — Outlook/Hotmail için tutarlı From + unsubscribe
      replyTo: config.user,
      headers: {
        "X-Entity-Ref-ID": `cortexplus-${Date.now()}`,
        "List-Unsubscribe": `<mailto:cortexplus@cortexplus.app?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
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

/**
 * "Hemen gir, içeride onayla" (31 Ekim 2026): kayıt kapıda beklemez, doğrulama bağlantısı bizim posta hattımızdan
 * gider (Supabase'in saatte 30 e-posta sınırı yok). Bağlantı imzalı ve 7 gün geçerli (email-verification.ts).
 */
export async function sendVerifyEmail({ to, name, url }: { to: string; name: string; url: string }) {
  const hello = name ? `Merhaba ${name.split(/\s+/)[0]},` : "Merhaba,";
  return sendEmail({
    to,
    subject: "Cortex Plus · E-postanı doğrula",
    html: layout(
      "E-postanı doğrula",
      `<p style="margin:0;">${hello} hesabın açıldı ve çalışmaya başlayabilirsin.</p>
       <p style="margin:12px 0 0;">Hesabını güvenceye almak ve davet hediyeni açmak için e-postanı doğrula. Bağlantı 7 gün geçerli.</p>
       <p style="margin:12px 0 0;">Bu hesabı sen açmadıysan bu e-postaya tıklama; bize yazman yeterli.</p>`,
      { href: url, label: "E-postamı doğrula" },
    ),
    text: `${hello} Cortex Plus hesabın açıldı. E-postanı doğrulamak için: ${url} (7 gün geçerli). Bu hesabı sen açmadıysan tıklama.`,
  });
}
