// @vitest-environment jsdom
import { StrictMode, isValidElement, type ReactElement } from "react";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { makeFakeDb } from "./helpers/fake-supabase";

/*
  Faz 7 (20 Kasım 2026): `/davet/<kod>` sayfası ve iki düğme. Misafir önizlemeyi görür, "Klonla" kayda gider (paylaşanın
  davet kodu ve `?otomatik=1`'li dönüş korunur); sahibi kendi hazırlığına, daha önce klonlayan kendi kopyasına gider;
  oturum açık öğrenci kopyayı tek istekle kurar. Hazırlık sayfasında tek paylaşım girişi "📲 Sınıfla Paylaş".
*/

const h = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  service: null as unknown,
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ replace: h.replace, push: h.push, refresh: vi.fn() }),
  usePathname: () => "/davet/abcdefghjk",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => h.service,
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}));
vi.mock("@/lib/auth/active-account", () => ({ accountActiveOrUnknown: async () => true }));
vi.mock("@/lib/student/parity-shell-props", () => ({ loadParityShellProps: async () => ({}) }));

import SharedPrepPage from "@/app/davet/[shareCode]/page";
import { ClonePrepButton, PREP_CLONE_URL } from "@/components/parity/clone-prep-button";
import { ClassShareButton, CLASS_SHARE_URL } from "@/components/parity/class-share-button";
import { SharedPrepCard } from "@/components/parity/shared-prep-card";
import { CLASS_SHARE_LABEL, CLONE_BUTTON_LABEL } from "@/lib/learning/class-share";
import { publicUnderProtected } from "@/lib/supabase/middleware";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const SHARER = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const SRC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CODE = "abcdefghjk";

function seedService(extraPreps: Record<string, unknown>[] = []) {
  const fake = makeFakeDb({
    exam_preps: [
      { id: SRC, user_id: SHARER, title: "TYT Fizik", exam_type: "TYT", exam_date: "2026-12-20", share_code: CODE, is_public_cloneable: true, learning_preferences: null },
      ...extraPreps,
    ],
    exam_prep_topics: [
      { id: "t1", exam_prep_id: SRC, label: "FİZ.9.1.1. Fizik bilimine giriş", sort_order: 0 },
      { id: "t2", exam_prep_id: SRC, label: "Madde ve özellikleri", sort_order: 1 },
    ],
    profiles: [{ id: SHARER, full_name: "Ayşe Yılmaz", referral_code: "AB12CD34" }],
  });
  h.service = fake.client;
  return fake;
}

/** Sunucu bileşeninin döndürdüğü ağaçta (çizmeden) öğe arar: alt öğeler ve öğe taşıyan bütün özellikler gezilir. */
function findElement(node: unknown, match: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (match(element)) return element;
  for (const value of Object.values(element.props ?? {})) {
    const found = findElement(value, match);
    if (found) return found;
  }
  return null;
}

const page = (shareCode: string, otomatik?: string) =>
  SharedPrepPage({ params: Promise.resolve({ shareCode }), searchParams: Promise.resolve(otomatik ? { otomatik } : {}) });

beforeEach(() => {
  h.user = null;
  h.replace.mockReset();
  h.push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/davet/<kod> sayfası", () => {
  it("misafir: önizleme ve kayıt bağlantısı; dönüş adresi (?otomatik=1) ve paylaşanın davet kodu korunur", async () => {
    seedService();
    const tree = await page("ABCDEFGHJK");
    const signup = findElement(tree, (el) => el.props["data-testid"] === "clone-signup");
    expect(signup).not.toBeNull();
    const href = new URL(String(signup!.props.href), "https://cortexplus.app");
    expect(href.pathname).toBe("/kayit");
    expect(href.searchParams.get("next")).toBe(`/davet/${CODE}?otomatik=1`);
    expect(href.searchParams.get("ref")).toBe("AB12CD34");
    const card = findElement(tree, (el) => el.type === SharedPrepCard);
    // Kazanım kodu atılmış konu adları ve maskeli ad; soyadı yok.
    expect((card!.props.prep as { units: string[] }).units).toEqual(["Fizik bilimine giriş", "Madde ve özellikleri"]);
    expect((card!.props.prep as { sharedBy: string }).sharedBy).toBe("Ay***");
    expect(findElement(tree, (el) => el.type === ClonePrepButton)).toBeNull();
  });

  it("sahibi kendi hazırlığına, daha önce klonlayan kendi kopyasına gider", async () => {
    seedService();
    h.user = { id: SHARER, email: "a@example.com" };
    await expect(page(CODE)).rejects.toThrow(`REDIRECT:/deneme-sinavlari/${SRC}`);
    seedService([{ id: "copy-1", user_id: FRIEND, forked_from: SRC, cloned_from_prep_id: SRC }]);
    h.user = { id: FRIEND, email: "m@example.com" };
    await expect(page(CODE)).rejects.toThrow("REDIRECT:/deneme-sinavlari/copy-1");
  });

  it("oturum açık öğrenci: klon düğmesi; kayıttan dönüşte kendiliğinden", async () => {
    seedService();
    h.user = { id: FRIEND, email: "m@example.com" };
    const plain = findElement(await page(CODE), (el) => el.type === ClonePrepButton);
    expect(plain!.props).toEqual({ shareCode: CODE, auto: false });
    const auto = findElement(await page(CODE, "1"), (el) => el.type === ClonePrepButton);
    expect(auto!.props).toEqual({ shareCode: CODE, auto: true });
  });

  /** Etkin olmayan bağlantının kartını (sunucu ağacından) çizer; 404 değil, iki yollu dostça kart. */
  async function inactiveCard(shareCode: string) {
    const tree = await page(shareCode);
    expect(findElement(tree, (el) => el.props["data-testid"] === "clone-signup")).toBeNull();
    expect(findElement(tree, (el) => el.type === ClonePrepButton)).toBeNull();
    const card = findElement(tree, (el) => "copy" in el.props && "signedIn" in el.props);
    expect(card).not.toBeNull();
    cleanup();
    render(card!);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Örnek dersi gör" }).getAttribute("href")).toBe("/ornek");
    return screen;
  }

  it("ana sayfanın örnek QR'ı (/davet/ORNEK): örnek olduğunu söyler; ücretsiz başla ve örnek ders", async () => {
    seedService();
    for (const raw of ["ORNEK", "ornek", "ÖRNEK"]) {
      const view = await inactiveCard(raw);
      expect(view.getByRole("heading", { level: 1 }).textContent).toBe("Bu bir örnek bağlantı");
      expect(view.getByRole("link", { name: "Ücretsiz başla" }).getAttribute("href")).toBe("/kayit");
    }
  });

  it("bilinmeyen, geçersiz ya da paylaşımı kapalı kod: 'artık etkin değil' ve aynı iki yol", async () => {
    const fake = seedService();
    for (const raw of ["mnpqrstuvw", "../etc", "kisa"]) {
      const view = await inactiveCard(raw);
      expect(view.getByRole("heading", { level: 1 }).textContent).toBe("Bu bağlantı artık etkin değil");
      expect(view.getByRole("link", { name: "Ücretsiz başla" }).getAttribute("href")).toBe("/kayit");
    }
    fake.db.tables.exam_preps[0].is_public_cloneable = false;
    expect((await inactiveCard(CODE)).getByRole("heading", { level: 1 }).textContent).toBe("Bu bağlantı artık etkin değil");
    // Oturum açık öğrenci sınavlarına döner; örnek ders yine açık.
    h.user = { id: FRIEND, email: "m@example.com" };
    const signedIn = await inactiveCard("ORNEK");
    expect(signedIn.getByRole("link", { name: "Sınavlarıma git" }).getAttribute("href")).toBe("/deneme-sinavlari");
    expect(signedIn.queryByRole("link", { name: "Ücretsiz başla" })).toBeNull();
  });

  it("herkese açık: middleware yalnız /davet/<kod>'u açar; /davet korumalı kalır. Bekleme kutusu yok", () => {
    expect(publicUnderProtected("/davet/abcdefghjk")).toBe(true);
    expect(publicUnderProtected("/davet")).toBe(false);
    expect(publicUnderProtected("/davet/")).toBe(false);
    expect(publicUnderProtected("/davet/a/b")).toBe(false);
    const source = read("src/app/davet/[shareCode]/page.tsx");
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).not.toMatch(/<Suspense|import \{[^}]*\bSuspense\b[^}]*\} from "react"/);
    expect(existsSync("src/app/davet/[shareCode]/loading.tsx")).toBe(false);
    expect(read("src/lib/supabase/middleware.ts")).toContain("matches(path, PROTECTED_PREFIXES) && !publicUnderProtected(path)");
  });
});

describe("klon düğmesi", () => {
  function stubFetch(responses: { status: number; body: unknown }[]) {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "null")) });
      const next = responses.shift() ?? { status: 500, body: {} };
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
    }));
    return calls;
  }

  it("kayıttan dönüşte bir kez ister (React'in çift çalıştırmasında da) ve kopyaya gider", async () => {
    const calls = stubFetch([{ status: 200, body: { id: "copy-9", status: "created" } }]);
    render(
      <StrictMode>
        <ClonePrepButton shareCode={CODE} auto />
      </StrictMode>,
    );
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/deneme-sinavlari/copy-9"));
    expect(calls).toEqual([{ url: PREP_CLONE_URL, body: { shareCode: CODE } }]);
  });

  it("ücretsiz sınırda Plus yolu görünür; iş sürerken ikinci basış istek atmaz", async () => {
    const calls = stubFetch([{ status: 402, body: { error: "Ücretsiz hesapta bir sınav hazırlığı açılabilir.", code: "free_prep_limit" } }]);
    render(<ClonePrepButton shareCode={CODE} />);
    const button = screen.getByRole("button", { name: CLONE_BUTTON_LABEL });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("link", { name: /Plus'a bak/ }).getAttribute("href")).toBe("/pay"));
    expect(calls).toHaveLength(1);
    expect(h.replace).not.toHaveBeenCalled();
  });
});

describe("Sınıfla Paylaş düğmesi", () => {
  it("pencere hemen açılır; bağlantı sunucudan gelir, WhatsApp ve kopyalama aynı mutlak adresle", async () => {
    const url = `https://cortexplus.app/davet/${CODE}`;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ mode: "clone", code: CODE, url, whatsappHref: `https://wa.me/?text=${encodeURIComponent(`x ${url}`)}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ClassShareButton prepId={SRC} />);
    fireEvent.click(screen.getByRole("button", { name: CLASS_SHARE_LABEL }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("class-share-url").textContent).toBe(url));
    const whatsapp = screen.getByRole("link", { name: /WhatsApp'ta paylaş/ });
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain(url);
    expect(whatsapp.getAttribute("target")).toBe("_blank");
    expect(screen.getByText(/\+50 Bonus Kredi/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(CLASS_SHARE_URL, expect.objectContaining({ method: "POST", body: JSON.stringify({ prepId: SRC }) }));
  });

  it("göç öncesi davet bağlantısında ödül sözü verilmez", async () => {
    const url = "https://cortexplus.app/hazirlik-davet/sinif.x.1.y";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ mode: "invite", url, whatsappHref: "https://wa.me/?text=a" }), { status: 200 })));
    render(<ClassShareButton prepId={SRC} />);
    fireEvent.click(screen.getByRole("button", { name: CLASS_SHARE_LABEL }));
    await waitFor(() => expect(screen.getByTestId("class-share-url").textContent).toBe(url));
    expect(screen.queryByText(/Bonus Kredi/)).toBeNull();
  });
});
