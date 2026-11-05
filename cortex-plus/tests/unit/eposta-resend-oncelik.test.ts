import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  E-posta yolu (5 Kasım 2026, ürün sahibinin kararı: "Resend'e geçelim"). RESEND_API_KEY tanımlıysa asıl yol Resend,
  düşerse Workspace SMTP; anahtar yoksa SMTP, düşerse Resend (yapılandırılmamış → gerekçeyle ret). Teslimat
  başlıkları iki yolda aynı. Sistem sayfası Resend'i bağlantı satırı olarak gösterir.
*/

const smtp = vi.hoisted(() => ({ configured: true, sendMail: vi.fn(async () => undefined) }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/smtp", () => ({
  getSmtpConfig: () => (smtp.configured ? { host: "smtp.example", port: 587, user: "cortexplus@cortexplus.app", pass: "x", from: "Cortex Plus <cortexplus@cortexplus.app>" } : null),
  createSmtpTransport: () => ({ sendMail: smtp.sendMail }),
}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const mail = { to: "ogrenci@example.com", subject: "Konu", html: "<p>Merhaba</p>", text: "Merhaba" };

describe("gönderim sırası (saf)", () => {
  it("Resend tanımlıysa önce Resend, SMTP yedek; değilse SMTP önce", async () => {
    const { deliveryOrder, resendConfigured } = await import("@/lib/email/mailer");
    expect(deliveryOrder({ resend: true, smtp: true })).toEqual(["resend", "smtp"]);
    expect(deliveryOrder({ resend: true, smtp: false })).toEqual(["resend"]);
    expect(deliveryOrder({ resend: false, smtp: true })).toEqual(["smtp", "resend"]);
    expect(deliveryOrder({ resend: false, smtp: false })).toEqual(["resend"]);
    expect(resendConfigured({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.c" })).toBe(true);
    expect(resendConfigured({ RESEND_API_KEY: " ", EMAIL_FROM: "a@b.c" })).toBe(false);
    expect(resendConfigured({ RESEND_API_KEY: "re_x" })).toBe(false);
  });
});

describe("sendEmail", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    smtp.configured = true;
    smtp.sendMail.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.EMAIL_FROM = "Cortex Plus <cortexplus@cortexplus.app>";
    process.env.RESEND_API_KEY = "re_test_key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("anahtar varken Resend gönderir; SMTP'ye hiç gidilmez; başlıklar ve yanıt adresi taşınır", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { sendEmail } = await import("@/lib/email/mailer");
    expect(await sendEmail(mail)).toEqual({ ok: true });
    expect(smtp.sendMail).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init.body)) as { to: string[]; headers: Record<string, string>; reply_to: string };
    expect(body.to).toEqual([mail.to]);
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(body.reply_to).toBe("cortexplus@cortexplus.app");
  });

  it("Resend düşerse (5xx ya da ağ) Workspace SMTP devralır", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "upstream" });
    const { sendEmail } = await import("@/lib/email/mailer");
    expect(await sendEmail(mail)).toEqual({ ok: true });
    expect(smtp.sendMail).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    expect(await sendEmail(mail)).toEqual({ ok: true });
    expect(smtp.sendMail).toHaveBeenCalledTimes(2);
  });

  it("anahtar yokken SMTP asıl yol; SMTP de düşerse gerekçe 'resend_not_configured'", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import("@/lib/email/mailer");
    expect(await sendEmail(mail)).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
    smtp.sendMail.mockRejectedValueOnce(new Error("535 auth"));
    expect(await sendEmail(mail)).toEqual({ ok: false, reason: "resend_not_configured" });
  });

  it("ikisi de düşerse son gerekçe SMTP'nin; hiçbiri yoksa yapılandırma eksik", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "invalid key" });
    smtp.sendMail.mockRejectedValue(new Error("535"));
    const { sendEmail } = await import("@/lib/email/mailer");
    expect(await sendEmail(mail)).toEqual({ ok: false, reason: "smtp_send_failed" });
    smtp.configured = false;
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail(mail)).toEqual({ ok: false, reason: "resend_not_configured" });
  });

  it("sistem sayfası Resend bağlantısını gösterir (kritik değil: SMTP yedek)", () => {
    const page = read("src/app/admin/sistem/page.tsx");
    expect(page).toContain('{ name: "Resend", env: ["RESEND_API_KEY"], critical: false }');
    const labels = read("src/lib/admin/labels.ts");
    expect(labels).toMatch(/Resend: "İşlem e-postası sağlayıcısı/);
  });
});
