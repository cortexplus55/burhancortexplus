// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  usePathname: () => "/deneme-sinavlari",
  useSearchParams: () => new URLSearchParams(),
}));
const tier = { value: "free" as string };
const exempt = { value: false };
vi.mock("@/lib/billing/entitlements", () => ({ planTier: async () => tier.value }));
vi.mock("@/lib/billing/free-preview", () => ({
  billingExempt: async () => exempt.value,
  freePreview: async () => null,
}));

import { PrepCard } from "@/components/parity/exam-prep";
import { PREP_DELETE_COPY, prepDeleteDescription } from "@/components/parity/prep-delete-button";
import { freeFirstLessonUsed } from "@/lib/billing/first-lesson-cycle";
import { toPrepCard } from "@/lib/learning/prep-cards";

/*
  21 Kasım 2026 (ürün sahibi): "sınav hazırlığı başlatabiliyor ama çalışmayacaksa ya da süresi bittiyse silmek isterse
  silme tuşu yok; silme kritik, emin misin diye sorulsun". Silme yalnız hazırlık sayfasının Seçenekler → Ayarlar
  sekmesinin dibindeydi. Şimdi Sınavlar kartında, Seçenekler listesinde ve Ayarlar'da aynı onay penceresiyle.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function stubFetch(freeLessonUsed = false) {
  const calls: { method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      // Uyarı satırı pencere açılınca bir kez sorulur (yalnız okur).
      if (url === "/api/learning/exam-prep/delete-note") {
        return new Response(JSON.stringify({ freeLessonUsed }), { status: 200 });
      }
      calls.push({ method: String(init?.method), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
  return calls;
}

const card = () =>
  toPrepCard(
    { id: "prep-1", title: "topic-alpha hazırlığı", exam_type: "Vize", target_score: 70, exam_date: "2026-11-10", view_count: 0 },
    [],
    [{ status: "ready" }],
    "2026-11-21",
  );

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Sınavlar kartında hazırlığı sil", () => {
  it("köşedeki düğme önce onay penceresini açar; Vazgeç hiçbir şey silmez", () => {
    const calls = stubFetch();
    render(<PrepCard card={card()} showTargetLabel />);
    fireEvent.click(screen.getByRole("button", { name: "Hazırlığı sil: topic-alpha hazırlığı" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain(PREP_DELETE_COPY.title);
    expect(dialog.textContent).toContain(prepDeleteDescription("topic-alpha hazırlığı"));
    expect(dialog.textContent).not.toContain(PREP_DELETE_COPY.freeLessonNote);
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(calls).toHaveLength(0);
  });

  it("onaylanınca sunucuya siler ve listeyi yeniler", async () => {
    const calls = stubFetch();
    render(<PrepCard card={card()} showTargetLabel={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Hazırlığı sil: topic-alpha hazırlığı" }));
    fireEvent.click(screen.getByRole("button", { name: PREP_DELETE_COPY.confirm }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(calls).toEqual([{ method: "DELETE", body: { prepId: "prep-1" } }]);
    expect(push).not.toHaveBeenCalled();
  });

  it("ücretsiz hesap ilk dersini kullandıysa onay yeni hazırlıkta dersin Plus istediğini söyler", async () => {
    const calls = stubFetch(true);
    render(<PrepCard card={card()} showTargetLabel />);
    fireEvent.click(screen.getByRole("button", { name: "Hazırlığı sil: topic-alpha hazırlığı" }));
    await waitFor(() => expect(screen.getByRole("alertdialog").textContent).toContain(PREP_DELETE_COPY.freeLessonNote));
    expect(calls).toHaveLength(0);
  });

  it("tarihsiz kartta da silme düğmesi var; sınav günü geçmiş kart silinebilir", () => {
    stubFetch();
    const undated = toPrepCard(
      { id: "prep-2", title: "topic-beta", exam_type: "Final", target_score: null, exam_date: null, view_count: 0 },
      [],
      [],
      "2026-11-21",
    );
    render(
      <>
        <PrepCard card={undated} showTargetLabel={false} />
        <PrepCard card={card()} showTargetLabel={false} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Hazırlığı sil: topic-beta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hazırlığı sil: topic-alpha hazırlığı" })).toBeTruthy();
  });
});

describe("hazırlık sayfası ve sayfalar", () => {
  it("Seçenekler listesinin sonunda silme satırı, Ayarlar'da aynı bileşen; ikisi de Sınavlar'a döner", () => {
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home).toMatch(/<PrepDeleteButton[\s\S]*?variant="row"[\s\S]*?redirectTo="\/deneme-sinavlari"/);
    const basics = read("src/components/parity/prep-basics-panel.tsx");
    expect(basics).toMatch(/<PrepDeleteButton[\s\S]*?variant="text"[\s\S]*?redirectTo="\/deneme-sinavlari"/);
    expect(basics).not.toContain('role="alertdialog"');
  });

  it("ilk ders uyarısı sayfa açılışında okunmaz (sorgu bütçesi), yalnız onay penceresi açılınca uçtan", () => {
    for (const page of [
      "src/app/deneme-sinavlari/page.tsx",
      "src/app/deneme-sinavlari/hazirliklarim/page.tsx",
      "src/app/deneme-sinavlari/[prepId]/page.tsx",
    ]) {
      expect(read(page)).not.toContain("freeFirstLessonUsed");
    }
    const route = read("src/app/api/learning/exam-prep/delete-note/route.ts");
    expect(route).toContain("freeFirstLessonUsed(service, userId)");
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export async function (POST|PATCH|DELETE)/);
  });
});

describe("ücretsiz ilk ders kullanıldı mı", () => {
  const service = (rows: unknown[] | null, error: unknown = null) =>
    ({
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          neq: () => chain,
          like: () => chain,
          gte: () => chain,
          limit: async () => ({ data: rows, error }),
        };
        return chain;
      },
    }) as unknown as Parameters<typeof freeFirstLessonUsed>[0];

  it("ücretsiz hesapta yol adımı açılmışsa evet, açılmamışsa hayır", async () => {
    tier.value = "free";
    exempt.value = false;
    expect(await freeFirstLessonUsed(service([{ id: "r1" }]), "user-1")).toBe(true);
    expect(await freeFirstLessonUsed(service([]), "user-1")).toBe(false);
  });

  it("ücretli ya da muaf hesapta ve okuma düşerse hayır (uyarı yanlış yere çıkmaz)", async () => {
    tier.value = "plus";
    expect(await freeFirstLessonUsed(service([{ id: "r1" }]), "user-1")).toBe(false);
    tier.value = "free";
    exempt.value = true;
    expect(await freeFirstLessonUsed(service([{ id: "r1" }]), "user-1")).toBe(false);
    exempt.value = false;
    expect(await freeFirstLessonUsed(service(null, { message: "down" }), "user-1")).toBe(false);
  });
});
