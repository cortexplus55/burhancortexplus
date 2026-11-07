import "server-only";
import { createSmtpTransport, getSmtpConfig } from "@/lib/email/smtp";
import { escapeHtml, personName } from "@/lib/email/escape";

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

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        reply_to: process.env.SMTP_USER?.trim() || "cortexplus@cortexplus.app",
        headers: UNSUBSCRIBE_HEADERS,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: body.slice(0, 200) || `resend_${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? `resend_${error.name}` : "resend_failed" };
  }
}

const RESEND_TIMEOUT_MS = 10_000;
/** Outlook/Hotmail teslimatı için tutarlı başlıklar (iki yolda da aynı). */
const UNSUBSCRIBE_HEADERS = {
  "List-Unsubscribe": "<mailto:cortexplus@cortexplus.app?subject=unsubscribe>",
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
};

/** İşlem e-postası sağlayıcısı anahtarı tanımlıysa Resend asıl yoldur (5 Kasım 2026, ürün sahibinin kararı). */
export function resendConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}

/**
 * Gönderim sırası: Resend tanımlıysa önce Resend, düşerse Workspace SMTP; tanımlı değilse SMTP, düşerse Resend
 * (anahtar yoksa "resend_not_configured"). Çağıran yalnız sonucu görür. Dönen `via` hangi yolun gönderdiğini söyler.
 */
export function deliveryOrder(input: { resend: boolean; smtp: boolean }): ("resend" | "smtp")[] {
  if (input.resend) return input.smtp ? ["resend", "smtp"] : ["resend"];
  return input.smtp ? ["smtp", "resend"] : ["resend"];
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
  const order = deliveryOrder({ resend: resendConfigured(), smtp: Boolean(config) });
  let lastReason = "email_not_configured";
  for (const via of order) {
    if (via === "resend") {
      const result = await sendViaResend({ to, subject, html, text });
      if (result.ok) return result;
      lastReason = result.reason;
      continue;
    }
    if (!config) continue;
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
        headers: { "X-Entity-Ref-ID": `cortexplus-${Date.now()}`, ...UNSUBSCRIBE_HEADERS },
      });
      return { ok: true };
    } catch {
      lastReason = "smtp_send_failed";
    }
  }
  return { ok: false, reason: lastReason };
}

function layout(title: string, body: string, cta?: { href: string; label: string }) {
  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;background:#0c0c0c;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#fafafa;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <p style="font-size:18px;font-weight:600;margin:0 0 24px;">Cortex Plus</p>
      <div style="background:#161616;border:1px solid #2a2a2a;border-radius:20px;padding:24px;">
        <h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(title)}</h1>
        <div style="font-size:14px;line-height:1.6;color:#c9c9c9;">${body}</div>
        ${
          cta
            ? `<a href="${escapeHtml(cta.href)}" style="display:inline-block;margin-top:20px;background:#4a6cf7;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:14px;">${escapeHtml(cta.label)}</a>`
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
  // Ad ve kod kullanıcıdan gelir: HTML kaçışı ve addan bağlantı temizliği (6 Kasım 2026).
  const who = personName(parentName) || "Velin";
  const code = String(inviteCode ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 32);
  const codeBlock = code
    ? `<p style="margin:16px 0 0;">Bağlantı kodu: <strong style="letter-spacing:4px;">${escapeHtml(code)}</strong></p>`
    : "";

  return sendEmail({
    to,
    subject: `${who} seni Cortex Plus'a davet ediyor`,
    html: layout(
      "Cortex Plus daveti",
      `<p style="margin:0;"><strong>${escapeHtml(who)}</strong> seni Cortex Plus'a davet etti ve ilerlemeni takip etmek istiyor.</p>
       <p style="margin:12px 0 0;">Hesabını oluşturduktan sonra profilindeki veli isteğini onaylaman yeterli. Sohbet içeriklerin gizli kalır; velinle yalnızca ilerleme özetin paylaşılır.</p>${codeBlock}`,
      { href: url, label: "Hesabımı oluştur" },
    ),
    text: `${who} seni Cortex Plus'a davet etti. Hesap oluştur: ${url}${code ? ` (kod: ${code})` : ""}`,
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
  const who = personName(parentName) || "Bir veli";
  return sendEmail({
    to,
    subject: "Yeni veli bağlantı isteği",
    html: layout(
      "Veli bağlantı isteği",
      `<p style="margin:0;"><strong>${escapeHtml(who)}</strong> hesabına veli olarak bağlanmak istiyor.</p>
       <p style="margin:12px 0 0;">İsteği onaylarsan ilerleme özetin (deneme sonuçların ve çalışma serin) velinle paylaşılır. Sohbet içeriklerin her durumda gizli kalır.</p>`,
      { href: url, label: "İsteği görüntüle" },
    ),
    text: `${who} hesabına veli olarak bağlanmak istiyor. Onaylamak için: ${url}`,
  });
}

/**
 * "Hemen gir, içeride onayla" (31 Ekim 2026): kayıt kapıda beklemez, doğrulama bağlantısı bizim posta hattımızdan
 * gider (Supabase'in saatte 30 e-posta sınırı yok). Bağlantı imzalı ve 7 gün geçerli (email-verification.ts).
 */
export async function sendVerifyEmail({ to, name, url }: { to: string; name: string; url: string }) {
  // Ad kayıtta serbest yazılıyor: yalnız harfler kalır, sonra HTML kaçışı (6 Kasım 2026).
  const first = personName(name, 1);
  const hello = first ? `Merhaba ${first},` : "Merhaba,";
  return sendEmail({
    to,
    subject: "Cortex Plus · E-postanı doğrula",
    html: layout(
      "E-postanı doğrula",
      `<p style="margin:0;">${escapeHtml(hello)} hesabın açıldı ve çalışmaya başlayabilirsin.</p>
       <p style="margin:12px 0 0;">Hesabını güvenceye almak ve davet hediyeni açmak için e-postanı doğrula. Bağlantı 7 gün geçerli.</p>
       <p style="margin:12px 0 0;">Bu hesabı sen açmadıysan bu e-postaya tıklama; bize yazman yeterli.</p>`,
      { href: url, label: "E-postamı doğrula" },
    ),
    text: `${hello} Cortex Plus hesabın açıldı. E-postanı doğrulamak için: ${url} (7 gün geçerli). Bu hesabı sen açmadıysan tıklama.`,
  });
}

/**
 * İade bildirimi (7 Kasım 2026, uyum paketi): uygulama içindeki bildirimin e-posta eşi. İade metni (iptal-iade
 * sayfası) "uygulama içinde bildirim ve e-posta" diyor; eskiden yalnız bildirim düşüyordu.
 */
export async function sendRefundEmail({
  to,
  title,
  body,
  appUrl,
}: {
  to: string;
  title: string;
  body: string;
  appUrl: string;
}) {
  const href = `${appUrl.replace(/\/$/, "")}/odemeler`;
  return sendEmail({
    to,
    subject: `Cortex Plus · ${title}`,
    html: layout(
      title,
      `<p style="margin:0;">${escapeHtml(body)}</p>
       <p style="margin:12px 0 0;">İadenin kartına yansıması bankana bağlı olarak birkaç iş günü sürebilir. Bir sorun görürsen Destek sayfasından bize yazabilirsin.</p>`,
      { href, label: "Ödemelerimi gör" },
    ),
    text: `${title}. ${body} İadenin kartına yansıması bankana bağlı olarak birkaç iş günü sürebilir. Ödemelerin: ${href}`,
  });
}

/**
 * Satın almanın sözleşme örneği (7 Kasım 2026, uyum paketi). Mesafeli Sözleşmeler Yönetmeliği: ön bilgilendirme ve
 * sözleşme, satın alma bilgileriyle birlikte tüketiciye kalıcı bir ortamda (e-posta) iletilir. Metnin kendisi
 * e-postanın içinde; bağlantı yalnız kolaylık.
 */
export async function sendPurchaseContractEmail({
  to,
  title,
  intro,
  sections,
  link,
}: {
  to: string;
  title: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
  link?: { href: string; label: string };
}) {
  const htmlSections = sections
    .map(
      (section) =>
        `<h2 style="font-size:15px;margin:20px 0 6px;color:#fafafa;">${escapeHtml(section.heading)}</h2>${section.body
          .map((line) => `<p style="margin:0 0 6px;">${escapeHtml(line)}</p>`)
          .join("")}`,
    )
    .join("");
  const textSections = sections
    .map((section) => `${section.heading}\n${section.body.join("\n")}`)
    .join("\n\n");
  return sendEmail({
    to,
    subject: `Cortex Plus · ${title}`,
    html: layout(title, `<p style="margin:0 0 8px;">${escapeHtml(intro)}</p>${htmlSections}`, link),
    text: `${intro}\n\n${textSections}${link ? `\n\n${link.label}: ${link.href}` : ""}`,
  });
}
