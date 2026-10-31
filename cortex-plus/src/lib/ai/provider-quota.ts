import "server-only";
import { redisPipeline } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/mailer";
import { digestRecipient } from "@/lib/admin/daily-digest";

/*
  OpenAI kotası bitti uyarısı (31 Ekim 2026, lansman zırhı).

  Sağlayıcı "insufficient_quota" dediği an (openai-client.ts) iki iz bırakılır: Redis'te son görülme anı
  (`/admin/sistem` gösterir, 6 saat tutulur) ve kurucuya e-posta (saatte en çok bir; alıcı günlük özetinkiyle aynı,
  `ADMIN_DIGEST_EMAIL=off` ikisini de kapatır). Redis yoksa e-posta bu sunucu örneğinde saatte bir.
  Ne bu modül ne çağıranı öğrenciye bir şey söyler: öğrencinin ekranı eskisi gibi "bu sefer tamamlanamadı" der,
  kredi iade edilir.
*/

const SEEN_KEY = "ops:openai_quota_seen";
const MAIL_KEY = "ops:openai_quota_mail";
const SEEN_TTL_S = 6 * 3_600;
const MAIL_TTL_S = 3_600;

let memoryMailedAt = 0;

export async function noteProviderQuotaExhausted(options: {
  now?: Date;
  send?: typeof sendEmail;
  env?: Record<string, string | undefined>;
} = {}): Promise<"mailed" | "noted" | "disabled"> {
  const now = options.now ?? new Date();
  console.error("openai_quota_exhausted", { at: now.toISOString() });
  const result = await redisPipeline([
    ["SET", SEEN_KEY, now.toISOString(), "EX", String(SEEN_TTL_S)],
    ["SET", MAIL_KEY, now.toISOString(), "NX", "EX", String(MAIL_TTL_S)],
  ]);
  let first: boolean;
  if (result) first = result[1] === "OK";
  else {
    first = now.getTime() - memoryMailedAt >= MAIL_TTL_S * 1_000;
    if (first) memoryMailedAt = now.getTime();
  }
  if (!first) return "noted";
  const to = digestRecipient(options.env);
  if (!to) return "disabled";
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://cortexplus.app";
  const text = [
    "OpenAI hesabının kredisi bitti (insufficient_quota).",
    "Şu anda dersler, testler, sohbet ve belge okuma düşüyor; öğrenciden kredi kesilmiyor, iade ediliyor.",
    "",
    "Yapılacak: platform.openai.com → Billing → kredi yükle (ya da aylık sınırı yükselt).",
    `Durum: ${app}/admin/sistem`,
  ].join("\n");
  const html = `<p><strong>OpenAI hesabının kredisi bitti</strong> (insufficient_quota).</p>
<p>Şu anda dersler, testler, sohbet ve belge okuma düşüyor; öğrenciden kredi kesilmiyor, iade ediliyor.</p>
<p>Yapılacak: platform.openai.com → Billing → kredi yükle (ya da aylık sınırı yükselt).</p>
<p><a href="${app}/admin/sistem">Sistem durumu</a></p>`;
  const sent = await (options.send ?? sendEmail)({ to, subject: "Dikkat · OpenAI kredisi bitti", text, html });
  return sent.ok ? "mailed" : "noted";
}

/** Son 6 saatte kota bitti cevabı görüldüyse anı; Redis yoksa ya da görülmediyse null. */
export async function providerQuotaSeenAt(): Promise<string | null> {
  const result = await redisPipeline([["GET", SEEN_KEY]]);
  const value = result?.[0];
  return typeof value === "string" && value ? value : null;
}

export function resetProviderQuotaForTests() {
  memoryMailedAt = 0;
}
