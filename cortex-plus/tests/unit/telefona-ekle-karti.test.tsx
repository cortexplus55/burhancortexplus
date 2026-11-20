// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { inAppBrowserApp } from "@/lib/auth/in-app-browser";
import { installPlatform } from "@/lib/pwa/install-platform";
import {
  EMPTY_INSTALL_CARD_MEMORY,
  INSTALL_CARD_COOLDOWN_MS,
  INSTALL_CARD_IOS_STEPS,
  INSTALL_CARD_STORAGE_KEY,
  installCardMode,
  parseInstallCardMemory,
  type InstallCardInput,
} from "@/lib/pwa/install-card";
import manifest from "@/app/manifest";

/*
  "📱 Telefonuna Uygulama Gibi Ekle" (20 Kasım 2026, Faz 8). Kart yalnız telefonda, kurulu değilken, uygulamanın kendi
  tarayıcısında değilken, öğrenci ilk adımını atmışken ve 30 günde bir çıkar. Android'de tarayıcının kurulum olayı
  (`beforeinstallprompt`) tek dokunuşla açılır; iPhone'da Safari'nin iki adımı gösterilir.
*/

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Instagram 300.0",
  whatsapp: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 WhatsApp/2.24",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

const NOW = Date.UTC(2026, 10, 20, 12);
const DAY = 24 * 60 * 60 * 1000;

function input(patch: Partial<InstallCardInput> = {}, ua: string = UA.android): InstallCardInput {
  return {
    platform: installPlatform(ua),
    inAppBrowser: inAppBrowserApp(ua),
    standalone: false,
    coarsePointer: true,
    narrowViewport: true,
    milestone: "prep_created",
    promptAvailable: true,
    installedNow: false,
    memory: EMPTY_INSTALL_CARD_MEMORY,
    now: NOW,
    ...patch,
  };
}

describe("kartın kararı (saf işlev)", () => {
  it("Android + kurulum olayı → tek dokunuşlu kart; olay yoksa kart yok (kurulu olabilir)", () => {
    expect(installCardMode(input())).toBe("android");
    expect(installCardMode(input({ promptAvailable: false }))).toBeNull();
  });

  it("iPhone Safari → iki adımlı rehber (olay hiç gelmez); başka iOS tarayıcısı ve masaüstü → yok", () => {
    expect(installCardMode(input({ promptAvailable: false }, UA.ios))).toBe("ios");
    expect(installCardMode(input({}, UA.iosChrome))).toBeNull();
    expect(installCardMode(input({}, UA.desktop))).toBeNull();
  });

  it("Instagram / Facebook / TikTok / WhatsApp tarayıcısında yok (kurulum yapamaz; 'tarayıcıda aç' şeridi var)", () => {
    expect(installCardMode(input({}, UA.instagram))).toBeNull();
    expect(installPlatform(UA.whatsapp)).toBe("android");
    expect(installCardMode(input({}, UA.whatsapp))).toBeNull();
  });

  it("zaten ana ekrandan açıldıysa ya da kurulum görüldüyse yok", () => {
    expect(installCardMode(input({ standalone: true }))).toBeNull();
    expect(installCardMode(input({ installedNow: true }))).toBeNull();
    expect(installCardMode(input({ memory: { lastAt: null, installed: true } }))).toBeNull();
    expect(installCardMode(input({ memory: { lastAt: NOW - 400 * DAY, installed: true } }, UA.ios))).toBeNull();
  });

  it("ilk adım şart: hazırlık kurulmuş ya da ilk ders bitmiş", () => {
    expect(installCardMode(input({ milestone: null }))).toBeNull();
    expect(installCardMode(input({ milestone: "lesson_completed" }))).toBe("android");
    expect(installCardMode(input({ milestone: "prep_created" }, UA.ios))).toBe("ios");
  });

  it("telefon: dokunmatik ekran ya da dar pencere; ikisi de yoksa yok", () => {
    expect(installCardMode(input({ coarsePointer: false, narrowViewport: false }))).toBeNull();
    expect(installCardMode(input({ coarsePointer: true, narrowViewport: false }))).toBe("android");
    expect(installCardMode(input({ coarsePointer: false, narrowViewport: true }))).toBe("android");
  });

  it("30 günde en çok bir kez; saat geri alınmışsa da erken çıkmaz", () => {
    expect(INSTALL_CARD_COOLDOWN_MS).toBe(30 * DAY);
    expect(installCardMode(input({ memory: { lastAt: NOW - 29 * DAY, installed: false } }))).toBeNull();
    expect(installCardMode(input({ memory: { lastAt: NOW - 30 * DAY, installed: false } }))).toBe("android");
    expect(installCardMode(input({ memory: { lastAt: NOW - 31 * DAY, installed: false } }, UA.ios))).toBe("ios");
    expect(installCardMode(input({ memory: { lastAt: NOW + 2 * DAY, installed: false } }))).toBeNull();
  });

  it("hafıza bozuksa boş sayılır", () => {
    expect(parseInstallCardMemory(null)).toEqual(EMPTY_INSTALL_CARD_MEMORY);
    expect(parseInstallCardMemory("{bozuk")).toEqual(EMPTY_INSTALL_CARD_MEMORY);
    expect(parseInstallCardMemory('"x"')).toEqual(EMPTY_INSTALL_CARD_MEMORY);
    expect(parseInstallCardMemory('{"lastAt":"dün","installed":"evet"}')).toEqual(EMPTY_INSTALL_CARD_MEMORY);
    expect(parseInstallCardMemory(JSON.stringify({ lastAt: NOW, installed: true }))).toEqual({ lastAt: NOW, installed: true });
  });
});

describe("manifest", () => {
  it("ana ekrandaki ad markanın tam adı; tam ekran, 192/512 + maskeli simge", () => {
    const value = manifest();
    expect(value.name).toBe("Cortex Plus");
    expect(value.short_name).toBe("Cortex Plus");
    expect(value.display).toBe("standalone");
    expect(value.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(value.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(value.icons?.map((icon) => `${icon.sizes}:${icon.purpose}`)).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
  });
});

/* ───────────── Bileşen ───────────── */

type PromptMock = Event & {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function promptEvent(outcome: "accepted" | "dismissed" = "accepted"): PromptMock {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as PromptMock;
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

function setDevice(ua: string, media: { coarse?: boolean; narrow?: boolean; standalone?: boolean } = {}) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  const { coarse = true, narrow = true, standalone = false } = media;
  window.matchMedia = ((query: string) => ({
    matches:
      (query === "(pointer: coarse)" && coarse) ||
      (query === "(max-width: 767px)" && narrow) ||
      (query === "(display-mode: standalone)" && standalone),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** Her test temiz modüllerle: kurulum olayı deposu modül düzeyinde. */
async function loadCard() {
  vi.resetModules();
  const { InstallAppCard } = await import("@/components/pwa/install-app-card");
  const store = await import("@/lib/pwa/install-prompt");
  return { InstallAppCard, store };
}

function stored() {
  return parseInstallCardMemory(window.localStorage.getItem(INSTALL_CARD_STORAGE_KEY));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Android: tek dokunuşla 'Ana Ekrana Ekle'", () => {
  it("olay gelince kart çıkar, düğme tarayıcının penceresini bir kez açar; kabul edilince bir daha çıkmaz", async () => {
    setDevice(UA.android);
    const { InstallAppCard } = await loadCard();
    const view = render(<InstallAppCard milestone="prep_created" />);
    expect(view.container.querySelector("[data-install-card]")).toBeNull();

    const event = promptEvent("accepted");
    await act(async () => {
      window.dispatchEvent(event);
    });
    // Tarayıcının kendi şeridi çıkmasın.
    expect(event.defaultPrevented).toBe(true);
    const card = view.container.querySelector('[data-install-card="android"]');
    expect(card).not.toBeNull();
    expect(screen.getByRole("heading", { name: /Telefonuna Uygulama Gibi Ekle/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: /Telefonuna Uygulama Gibi Ekle/ })).toBeTruthy();
    // Gösterim 30 günü başlatır.
    expect(stored().lastAt).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ana Ekrana Ekle" }));
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector("[data-install-card]")).toBeNull();
    expect(stored().installed).toBe(true);
  });

  it("pencere reddedilirse kart kapanır, 30 gün çıkmaz; olay ikinci kez kullanılmaz", async () => {
    setDevice(UA.android);
    const { InstallAppCard, store } = await loadCard();
    render(<InstallAppCard milestone="lesson_completed" placement="inline" />);
    const event = promptEvent("dismissed");
    await act(async () => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ana Ekrana Ekle" }));
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(store.installPromptState().prompt).toBeNull();
    expect(await store.promptInstall()).toBe("unavailable");
    expect(stored().installed).toBe(false);
    expect(Date.now() - (stored().lastAt ?? 0)).toBeLessThan(INSTALL_CARD_COOLDOWN_MS);
  });

  it("kart açıkken uygulama kurulursa (tarayıcı menüsünden) kart kapanır ve bu cihazda bir daha çıkmaz", async () => {
    setDevice(UA.android);
    const { InstallAppCard } = await loadCard();
    const { InstallPromptCapture } = await import("@/components/pwa/install-prompt-capture");
    const view = render(
      <>
        <InstallPromptCapture />
        <InstallAppCard milestone="prep_created" />
      </>,
    );
    await act(async () => {
      window.dispatchEvent(promptEvent());
    });
    expect(view.container.querySelector('[data-install-card="android"]')).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(view.container.querySelector("[data-install-card]")).toBeNull();
    expect(stored().installed).toBe(true);
  });

  it("olay başka bir sayfada yakalandıysa (sayfa yenilenmeden geçiş) kart onu kullanır", async () => {
    setDevice(UA.android);
    const { InstallAppCard } = await loadCard();
    const event = promptEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const view = render(<InstallAppCard milestone="prep_created" />);
    expect(view.container.querySelector('[data-install-card="android"]')).not.toBeNull();
  });
});

describe("iPhone: iki adımlı rehber", () => {
  it("Paylaş → Ana Ekrana Ekle; resim yok, simgeler satır içi", async () => {
    setDevice(UA.ios);
    const { InstallAppCard } = await loadCard();
    const view = render(<InstallAppCard milestone="prep_created" />);
    const card = view.container.querySelector('[data-install-card="ios"]');
    expect(card).not.toBeNull();
    const steps = [...card!.querySelectorAll("ol > li")].map((item) => item.querySelector(".cx-install-card__step-text")?.textContent);
    expect(steps).toEqual([...INSTALL_CARD_IOS_STEPS]);
    expect(INSTALL_CARD_IOS_STEPS.join(" → ")).toBe("Alttaki Paylaş simgesine dokun → 'Ana Ekrana Ekle'yi seç");
    expect(card!.querySelectorAll("img")).toHaveLength(0);
    expect(card!.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
    // iPhone'da tek dokunuşlu kurulum yok.
    expect(screen.queryByRole("button", { name: "Ana Ekrana Ekle" })).toBeNull();
    // Çevrimdışı ya da bildirim sözü yok.
    expect(card!.textContent).not.toMatch(/çevrimdışı|internetsiz|bildirim/i);
  });

  it("'Şimdi değil' kapatır ve 30 gün saklar; yeniden açılınca kart çıkmaz", async () => {
    setDevice(UA.ios);
    const { InstallAppCard } = await loadCard();
    const first = render(<InstallAppCard milestone="prep_created" />);
    fireEvent.click(screen.getByRole("button", { name: "Şimdi değil" }));
    expect(first.container.querySelector("[data-install-card]")).toBeNull();
    expect(stored().lastAt).toBeGreaterThan(0);
    first.unmount();
    const again = render(<InstallAppCard milestone="lesson_completed" />);
    expect(again.container.querySelector("[data-install-card]")).toBeNull();
  });

  it("× ve Escape de kapatır; odak ana içeriğe geçer", async () => {
    setDevice(UA.ios);
    const { InstallAppCard } = await loadCard();
    const view = render(
      <main id="icerik">
        <InstallAppCard milestone="prep_created" placement="inline" />
      </main>,
    );
    const close = screen.getByRole("button", { name: "Kartı kapat" });
    close.focus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(view.container.querySelector("[data-install-card]")).toBeNull();
    expect(document.activeElement?.id).toBe("icerik");

    window.localStorage.clear();
    const { InstallAppCard: Fresh } = await loadCard();
    const next = render(<Fresh milestone="prep_created" />);
    fireEvent.click(screen.getByRole("button", { name: "Kartı kapat" }));
    expect(next.container.querySelector("[data-install-card]")).toBeNull();
  });

  it("son 30 günde gösterildiyse çıkmaz; 31 gün önce gösterildiyse çıkar", async () => {
    setDevice(UA.ios);
    window.localStorage.setItem(INSTALL_CARD_STORAGE_KEY, JSON.stringify({ lastAt: Date.now() - 5 * DAY }));
    let { InstallAppCard } = await loadCard();
    const recent = render(<InstallAppCard milestone="prep_created" />);
    expect(recent.container.querySelector("[data-install-card]")).toBeNull();
    recent.unmount();
    window.localStorage.setItem(INSTALL_CARD_STORAGE_KEY, JSON.stringify({ lastAt: Date.now() - 31 * DAY }));
    ({ InstallAppCard } = await loadCard());
    const old = render(<InstallAppCard milestone="prep_created" />);
    expect(old.container.querySelector('[data-install-card="ios"]')).not.toBeNull();
  });
});

describe("kart çıkmaz", () => {
  it.each([
    ["Instagram tarayıcısı", UA.instagram, {}],
    ["WhatsApp tarayıcısı", UA.whatsapp, {}],
    ["masaüstü", UA.desktop, { coarse: false, narrow: false }],
    ["ana ekrandan açılmış", UA.ios, { standalone: true }],
  ])("%s", async (_label, ua, media) => {
    setDevice(ua, media);
    const { InstallAppCard } = await loadCard();
    const view = render(<InstallAppCard milestone="prep_created" />);
    await act(async () => {
      window.dispatchEvent(promptEvent());
    });
    expect(view.container.querySelector("[data-install-card]")).toBeNull();
  });

  it("ilk adım yokken", async () => {
    setDevice(UA.ios);
    const { InstallAppCard } = await loadCard();
    const view = render(<InstallAppCard milestone={null} />);
    expect(view.container.querySelector("[data-install-card]")).toBeNull();
  });

  it("iOS ana ekrandan açılmışsa (navigator.standalone)", async () => {
    setDevice(UA.ios);
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    try {
      const { InstallAppCard } = await loadCard();
      const view = render(<InstallAppCard milestone="prep_created" />);
      expect(view.container.querySelector("[data-install-card]")).toBeNull();
    } finally {
      Object.defineProperty(window.navigator, "standalone", { value: undefined, configurable: true });
    }
  });
});

describe("depolama yazılamıyorsa", () => {
  it("kart bu ziyarette ikinci kez çıkmaz (bellekteki kopya)", async () => {
    setDevice(UA.ios);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { InstallAppCard } = await loadCard();
    const first = render(<InstallAppCard milestone="prep_created" />);
    expect(first.container.querySelector('[data-install-card="ios"]')).not.toBeNull();
    first.unmount();
    // Aynı modül (aynı ziyaret): yeniden yükleme yok.
    const second = render(<InstallAppCard milestone="lesson_completed" />);
    expect(second.container.querySelector("[data-install-card]")).toBeNull();
  });
});

describe("yerleşim", () => {
  const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

  it("hazırlık sayfasında sabit (alt çubuğun üstünde), ders sonucunda akışta; öğretmen ana ekranında yok", () => {
    expect(read("src/app/deneme-sinavlari/[prepId]/page.tsx")).toContain('<InstallAppCard milestone="prep_created" placement="dock" />');
    expect(read("src/components/parity/exam-node/result.tsx")).toContain(
      '{payload.type === "lesson" ? <InstallAppCard milestone="lesson_completed" placement="inline" /> : null}',
    );
    expect(read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/sonuc/page.tsx")).toContain(
      '{node.kind === "lesson" ? <InstallAppCard milestone="lesson_completed" placement="inline" /> : null}',
    );
    expect(read("src/app/ogretmen/page.tsx")).not.toContain("InstallAppCard");
    // Kurulum olayı öğrenci kabuğunda yakalanır (sayfa geçişlerinde kaybolmasın).
    expect(read("src/components/parity/sor-shell.tsx")).toContain("<InstallPromptCapture />");
  });

  it("sabit kart çentiği sayar, 44 px dokunma, en küçük yazı 12 px üstü; ham renk yok", () => {
    const css = read("src/styles/install-app-card.css");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
    expect(css).toMatch(/\.cx-install-card__close \{[^}]*width: var\(--cx-tap-min\);\n\s*height: var\(--cx-tap-min\);/);
    expect(css).toMatch(/\.cx-install-card__btn \{[^}]*min-height: var\(--cx-control-m\);/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*(?:[0-9]|1[01])px/);
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
