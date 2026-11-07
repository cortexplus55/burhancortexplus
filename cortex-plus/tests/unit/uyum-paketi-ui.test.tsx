// @vitest-environment jsdom
/*
  Uyum paketi arayüzü (7 Kasım 2026): okumadan işaretlenemeyen kutu, yaş beyanı, çerez bandı ve onay kapısı.
  Kaydırmanın sonu IntersectionObserver ile görülür; testte gözlemci elle tetiklenir.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ogretmen",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

type ObserverEntry = { callback: IntersectionObserverCallback; target: Element | null };
const observers: ObserverEntry[] = [];

class FakeObserver {
  entry: ObserverEntry;
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, target: null };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.target = target;
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function reachEnd() {
  act(() => {
    for (const entry of observers) {
      entry.callback([{ isIntersecting: true, target: entry.target } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  });
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  document.cookie.split(";").forEach((part) => {
    const name = part.trim().split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("okumadan işaretlenemeyen kutu", async () => {
  const { ReadGate } = await import("@/components/legal/read-gate");

  function Harness({ remembered = false, onChange = vi.fn() }: { remembered?: boolean; onChange?: (value: unknown) => void }) {
    const [state, setState] = useState<{ checked: boolean; evidence: unknown }>({ checked: false, evidence: null });
    return (
      <ReadGate
        docId="kvkk_aydinlatma"
        linkText="KVKK Aydınlatma Metni"
        after="'ni okudum ve anladım."
        ariaLabel="KVKK Aydınlatma Metni'ni okudum ve anladım"
        checked={state.checked}
        remembered={remembered}
        onChange={(change) => {
          setState(change);
          onChange(change);
        }}
      />
    );
  }

  it("kutuya dokunmak metni açar; sonu görünmeden onay düğmesi kapalı; onaylanınca kutu ve kanıt", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: /KVKK Aydınlatma Metni'ni okudum/ });
    fireEvent.click(box);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(box.getAttribute("aria-checked")).toBe("false");
    const confirm = screen.getByRole("button", { name: "Okudum, onaylıyorum" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByText("Onaylamak için metni sonuna kadar kaydır.")).toBeTruthy();

    reachEnd();
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"));
    const change = onChange.mock.calls.at(-1)?.[0] as { checked: boolean; evidence: { version: string; scrolledToEnd: boolean } };
    expect(change.checked).toBe(true);
    expect(change.evidence.version).toBe("2026-11-07");
    expect(change.evidence.scrolledToEnd).toBe(true);

    // Okuduktan sonra kaldırıp yeniden işaretlemek metni bir daha açtırmaz.
    fireEvent.click(box);
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("false"));
    fireEvent.click(box);
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("metnin adına dokunmak da metni açar; pencerede özet ve bölümler var", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("link", { name: "KVKK Aydınlatma Metni" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Kısaca");
    expect(dialog.textContent).toContain("Haklarınız (KVKK m.11)");
  });

  it("bu sürümü daha önce okumuş kullanıcıda kutu doğrudan işaretlenir", async () => {
    render(<Harness remembered />);
    const box = screen.getByRole("checkbox", { name: /KVKK/ });
    fireEvent.click(box);
    await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("yaş beyanı", async () => {
  const { AgeDeclarationField, EMPTY_AGE } = await import("@/components/legal/age-declaration");

  it("seçim önceden yapılmaz; 18 altı seçilince velinin izni kutusu çıkar", () => {
    function Harness() {
      const [value, setValue] = useState(EMPTY_AGE);
      return <AgeDeclarationField value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const minor = screen.getByRole("radio", { name: "18 yaşından küçüğüm" }) as HTMLInputElement;
    const adult = screen.getByRole("radio", { name: "18 yaşında ya da büyüğüm" }) as HTMLInputElement;
    expect(minor.checked || adult.checked).toBe(false);
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(minor);
    expect(screen.getByRole("checkbox", { name: /Velim bu metinleri okudu/ })).toBeTruthy();
    fireEvent.click(adult);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("çerez bandı", async () => {
  const { CookieBanner } = await import("@/components/legal/cookie-banner");
  const { readCookieConsent } = await import("@/lib/consent/cookie-consent");

  it("oturumsuz ziyaretçide istek atmadan görünür; üç düğme aynı biçimde", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<CookieBanner />);
    const region = await screen.findByRole("region", { name: "Çerez tercihi" });
    const buttons = ["Reddet", "Tercihler", "Kabul et"].map((name) => screen.getByRole("button", { name }));
    expect(new Set(buttons.map((button) => button.className)).size).toBe(1);
    expect(region.textContent).toContain("Çerez Politikası");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Reddet analitiği kapalı yazar ve bandı kapatır; tercih kaydı gönderilir", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<CookieBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Reddet" }));
    expect(readCookieConsent()?.a).toBe(false);
    expect(screen.queryByRole("region", { name: "Çerez tercihi" })).toBeNull();
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ analytics: false, action: "reject_all" });
  });

  it("Tercihler'de analitik kapalı başlar; açılıp kaydedilince izin yazılır", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    render(<CookieBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Tercihler" }));
    const toggle = await screen.findByRole("switch", { name: "Analitik" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Seçimi kaydet" }));
    expect(readCookieConsent()?.a).toBe(true);
  });

  it("giriş yapmış öğrencinin bu sürümdeki tercihi hesaptan gelir; bant yeniden sorulmaz", async () => {
    document.cookie = "sb-test-auth-token=base64-abc; Path=/";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choice: { consentId: "0f8fad5b-d9cb-469f-a165-70867728950e", analytics: true, at: Date.now() - 1000 } })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<CookieBanner />);
    await waitFor(() => expect(readCookieConsent()?.a).toBe(true));
    expect(screen.queryByRole("region", { name: "Çerez tercihi" })).toBeNull();
    // Hesaptan geri yüklenen tercih ikinci kez kaydedilmez.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("onay kapısı", async () => {
  const { ConsentGateDialog } = await import("@/components/legal/consent-gate");

  it("eksik metinler ve yaş okunup onaylanmadan düğme kapalı; onay sunucuya kanıtla gider", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, missing: [], ageNeeded: false })));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(
      <ConsentGateDialog
        state={{
          missing: [
            { type: "kvkk_aydinlatma", version: "2026-11-07", previous: "2026-08-27" },
            { type: "kullanim_kosullari", version: "2026-11-07", previous: "2026-09-28" },
          ],
          ageNeeded: true,
        }}
        onDone={onDone}
      />,
    );
    expect(await screen.findByText("Metinlerimizi güncelledik")).toBeTruthy();
    // İlk odak metnin gövdesinde: hiçbir yaş seçeneği seçili ya da odaklı görünmez (canlıda görüldü, 7 Kasım 2026).
    await waitFor(() => expect(document.activeElement?.hasAttribute("data-initial-focus")).toBe(true));
    for (const radio of screen.getAllByRole("radio") as HTMLInputElement[]) expect(radio.checked).toBe(false);
    const submit = screen.getByRole("button", { name: "Onayla ve devam et" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "18 yaşında ya da büyüğüm" }));
    for (const name of [/KVKK Aydınlatma Metni'ni okudum/, /Kullanım Koşulları'nı okudum/]) {
      fireEvent.click(screen.getByRole("checkbox", { name }));
      reachEnd();
      const confirm = (await screen.findAllByRole("button", { name: "Okudum, onaylıyorum" })).at(-1) as HTMLButtonElement;
      await waitFor(() => expect(confirm.disabled).toBe(false));
      fireEvent.click(confirm);
    }
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/consent/accept");
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body.documents).sort()).toEqual(["kullanim_kosullari", "kvkk_aydinlatma"]);
    expect(body.documents.kvkk_aydinlatma.scrolledToEnd).toBe(true);
    expect(body.age).toEqual({ minor: false, guardianAck: false });
  });
});
