import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sendEmail = vi.fn(async (_input: { to: string; subject: string; idempotencyKey?: string }) => ({ ok: true as const }));
vi.mock("@/lib/email/mailer", () => ({ sendEmail: (input: { to: string; subject: string; idempotencyKey?: string }) => sendEmail(input) }));

import { sendPlanNoticeMails } from "@/lib/email/plan-notice-mails";
import { renderPlanNoticeMail } from "@/lib/email/templates";

const read = (path: string) => readFileSync(path, "utf8");

/*
  Plus yaşam döngüsü (8 Kasım 2026, son kontrol): Plus'tan ücretsize dönen öğrenci kendi ürettiği podcast ve sözlüyü
  açamıyor, podcast sesini çalamıyordu; otomatik yenileme olmadığı hâlde bitiş hatırlatması yalnız uygulama içindeydi.
*/
describe("Plus bitince kendi içeriği açık kalır", () => {
  it("kayıtlı adımı yeniden açmak Plus ve hak kapılarından önce", () => {
    const start = read("src/lib/learning/node/start.ts");
    const reopen = start.indexOf("const reopenedEarly = await reopenSavedAttempt(");
    const gate = start.indexOf('if (kind === "podcast" && !requireFeature(entitlements, "podcast"))');
    const meter = start.indexOf('if (nodeMeter === "plus")');
    expect(reopen).toBeGreaterThan(0);
    expect(reopen).toBeLessThan(gate);
    expect(reopen).toBeLessThan(meter);
    expect(start).toContain("if (parsed.data.review === true || parsed.data.replay === true)");
  });

  it("ücretsiz hesapta podcast sesi yalnız önbellekten; yeni satır Plus ister", () => {
    const audio = read("src/app/api/learning/podcast/audio/route.ts");
    expect(audio).toContain("const newChars = await countNewAudioChars(guard.ctx.service, speech).catch(() => -1);");
    expect(audio).toContain('if (newChars !== 0) return errorResponse(402, "premium_required");');
    // Genel duvar kalktı: önce her istekte, kayıt okunmadan 402 dönüyordu.
    expect(audio).not.toMatch(/if \(!requireFeature\(entitlements, "podcast"\)\) \{\s*return errorResponse\(402/);
  });
});

describe("Plus bitiş hatırlatması e-postayla da gider", () => {
  it("hatırlatma ve bitiş bildirimleri e-posta kuyruğuna da yazılır", () => {
    const cron = read("src/app/api/cron/subscription-renewal/route.ts");
    expect(cron).toContain('pushNotice(sub, "expired", trialNotice("expired"))');
    expect(cron).toContain('pushNotice(sub, "reminder", trialNotice("reminder", whenText))');
    expect(cron).toContain("planMails = await sendPlanNoticeMails(service, mails, now);");
    expect(cron).not.toMatch(/notices\.push\(\{\s*user_id: sub\.user_id,\s*title:/);
  });

  it("hesabın adresine, tekillik anahtarıyla; adresi olmayan atlanır", async () => {
    sendEmail.mockClear();
    const service = {
      auth: {
        admin: {
          getUserById: async (id: string) => ({ data: { user: id === "u1" ? { email: "ogrenci@example.com" } : { email: null } } }),
        },
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: "Ada Yılmaz" } }) }) }) }),
    } as never;
    const result = await sendPlanNoticeMails(service, [
      { userId: "u1", subscriptionId: "s1", kind: "reminder", title: "Plus aboneliğin 3 gün sonra bitiyor", body: "Dönemin doluyor." },
      { userId: "u2", subscriptionId: "s2", kind: "expired", title: "Plus aboneliğin sona erdi", body: "Bugün kapandı." },
    ]);
    expect(result).toEqual({ sent: 1, failed: 0, skipped: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = sendEmail.mock.calls[0]![0];
    expect(call.to).toBe("ogrenci@example.com");
    expect(call.idempotencyKey).toBe("plan-reminder-s1");
    expect(call.subject).toBe("Plus aboneliğin 3 gün sonra bitiyor");
  });

  it("şablon kişiyi adıyla selamlar, düğme Abonelik'e gider, çıkış bağlantısı yok (hizmet e-postası)", () => {
    const mail = renderPlanNoticeMail({ firstName: "Ada Yılmaz", title: "Plus aboneliğin sona erdi", body: "Bugün kapandı.", ctaLabel: "Plus'a geri dön", ctaUrl: "https://cortexplus.app/pay" });
    expect(mail.text).toContain("Merhaba Ada,");
    expect(mail.html).toContain("https://cortexplus.app/pay");
    expect(mail.text).not.toMatch(/abonelikten çık/i);
  });
});
