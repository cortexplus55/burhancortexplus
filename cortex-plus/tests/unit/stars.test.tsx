// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ogretmen",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { StarsDialog } from "@/components/parity/stars-dialog";
import { DAILY_STAR_GOAL, STAR_RULES, duelStars, prepStars } from "@/lib/stars/rules";
import { starsToTop, toLeaderboardRows, todayLine } from "@/lib/stars/view";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const read = (path: string) => readFileSync(path, "utf8");

/*
  Yıldızlar (17 Ekim 2026, ürün sahibinin kararı: Astra'daki gibi). Astra canlıda:
  "Yıldızlar: bugün 11 / 50", Okul arkadaşları / Türkiye / Okullar, Bu hafta / Tüm
  zamanlar, "Nasıl yıldız kazanılır", test sonucunda "+17 yıldız".
*/
describe("yıldız kuralları", () => {
  it("Astra'nın sayıları: hazırlık 10–210, düello 30–130, günlük hedef 50", () => {
    expect(DAILY_STAR_GOAL).toBe(50);
    expect(prepStars("lesson", null, null)).toBe(10);
    expect(prepStars("lesson", 4, 4)).toBe(20);
    expect(prepStars("quiz", 7, 7)).toBe(24);
    expect(prepStars("quiz", 40, 40)).toBe(40);
    expect(prepStars("written_exam", 0, 20)).toBe(30);
    expect(prepStars("written_exam", 60, 60)).toBe(210);
    // Podcast sabit 20 (20 Ekim 2026): dinleme kontrolünü atlamak (1/1) cevaplamaktan (0/3, 2/3) fazla kazandırmaz.
    expect(prepStars("podcast", 1, 1)).toBe(20);
    expect(prepStars("podcast", 0, 3)).toBe(20);
    expect(prepStars("podcast", 2, 3)).toBe(20);
    expect(duelStars(0)).toBe(30);
    expect(duelStars(7)).toBe(100);
    expect(duelStars(20)).toBe(130);
    expect(STAR_RULES.map((rule) => rule.amount)).toEqual(["300", "10–210", "30–130", "100", "100 + 50", "50", "25", "15"]);
    expect(todayLine(11)).toBe("Yıldızlar: bugün 11 / 50");
  });

  it("'İlk 20 arasına girmek için N yıldız' yalnız öğrenci ilk 20'de değilse", () => {
    const rows = toLeaderboardRows([
      ...Array.from({ length: 20 }, (_, index) => ({ rank: index + 1, label: `K${index}`, stars: 1000 - index * 10, is_me: false })),
      { rank: 42, label: "Ben", stars: 300, is_me: true },
    ]);
    expect(starsToTop(rows)).toBe(1000 - 19 * 10 - 300 + 1);
    expect(starsToTop(rows.map((row) => (row.rank === 3 ? { ...row, isMe: true } : { ...row, isMe: false })))).toBeNull();
  });
});

describe("yıldız veren yerler", () => {
  it("etkinlik bitince denemeye bir kez; sonuç cevabında 'stars'", () => {
    const node = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(node).toContain("ref: `attempt:${attempt.id}`,");
    expect(node).toContain("amount: prepStars(kind, completed.score, completed.total),");
    expect(node).toMatch(/score: completed\.score,\s+total: completed\.total,\s+stars,/);
  });

  it("düello, sohbet, okuldan katılım ve davet edilenin aboneliği", () => {
    expect(read("src/app/api/duels/[code]/run/route.ts")).toContain('source: "duel", ref: `duel:${duel.id}`');
    expect(read("src/app/api/ai/chat/route.ts")).toContain("after(() => awardChatStars(service, userId));");
    expect(read("src/lib/stars/chat.ts")).toContain("ref: `chat:${day}`");
    expect(read("src/app/api/school/route.ts")).toContain('source: "prep_joined",');
    expect(read("src/app/api/payments/paytr/callback/route.ts")).toContain(
      "await awardInviteSubscribed(service, result.beneficiary_id ?? result.payer_id);",
    );
  });

  it("üst çubukta düğme, sonuç ekranında '+N yıldız', okul sayfasında kürsü", () => {
    expect(read("src/components/parity/sor-shell.tsx")).toContain("<StarsButton />");
    expect(read("src/components/parity/parity-dialog-host.tsx")).toContain('<StarsDialog open={dialog === "stars"} onClose={closeDialog} />');
    expect(read("src/components/parity/exam-node-session.tsx")).toContain("+{starsEarned} yıldız");
    expect(read("src/app/deneme-sinavlari/okulum/page.tsx")).toContain('p_period: "last_week", p_limit: 3');
    expect(read("src/app/api/profile/me/route.ts")).toContain("stars_hidden: z.boolean().optional(),");
  });
});

describe("Yıldızlar penceresi", () => {
  const body = {
    me: { today: 11, week: 11, all: 15, sourcesWeek: { chat: 15 }, sourcesAll: { chat: 15 }, hidden: false, hasSchool: true },
    rows: [
      { rank: 1, label: "Ayşe K.", detail: "Giresun Tıp", students: null, stars: 40, is_me: false },
      { rank: 2, label: "Mert D.", detail: "Giresun Tıp", students: null, stars: 11, is_me: true },
    ],
    fallback: false,
  };

  it("bu haftanın yıldızları, sıralama, kaynaklar ve kurallar", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<StarsDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Ayşe K.")).toBeTruthy());
    expect(screen.getByText("Mert D. (sen)")).toBeTruthy();
    expect(screen.getByText("Yıldızlar: bugün 11 / 50")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Okul arkadaşları/ }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: /Türkiye/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/stars?scope=country&period=week", { cache: "no-store" }));

    fireEvent.click(screen.getByRole("button", { name: /Yıldızlarını nereden kazandın/ }));
    expect(screen.getByText("Öğretmenle sohbet")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Nasıl yıldız kazanılır" }));
    expect(screen.getByText("Arkadaşın abone olsun")).toBeTruthy();
    expect(screen.getByText("Günde bir kez, 3 mesajdan sonra")).toBeTruthy();
  });

  it("okulda tek kişiysen davet çağrısı; ad gizleme ayarı kaydedilir", async () => {
    const alone = { ...body, rows: [{ rank: 1, label: "Mert D.", detail: null, students: null, stars: 11, is_me: true }] };
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/profile/me" ? new Response("{}", { status: 200 }) : new Response(JSON.stringify(alone), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<StarsDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Okulundan ilk katılan sensin")).toBeTruthy());
    expect(screen.getByRole("link", { name: "Sınıf arkadaşlarını davet et" }).getAttribute("href")).toBe("/davet");
    fireEvent.click(screen.getByRole("checkbox", { name: /Sıralamada adımı gösterme/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/profile/me",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ stars_hidden: true }) }),
      ),
    );
  });
});
