// @vitest-environment jsdom
/**
 * Mobil 1. adım ekranları (26 Kasım 2026): kilit katmanı, zorunlu güncelleme, Ayarlar'daki kilit anahtarı, düelloda
 * bildir/engelle, kilit ekranı medya kancası ve çıkışta yerel hatırlatmaların silinmesi. Web'de hiçbiri çizilmez.
 * Uygulama ortamı yerel köprü taklit edilerek kurulur; canlı ağ çağrısı yok.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ native: false, platform: "web" as "ios" | "android" | "web" }));
const plugin = vi.hoisted(() => ({
  biometricStatus: vi.fn(async () => ({ available: true, biometric: true, kind: "face" })),
  biometricVerify: vi.fn(async () => ({ verified: true })),
  requestReview: vi.fn(async () => ({ requested: true })),
  mediaUpdate: vi.fn(async () => ({ native: true })),
  mediaStop: vi.fn(async () => undefined),
  addListener: vi.fn<(event: string, handler: (event: { action: string; positionMs?: number }) => void) => Promise<{ remove: () => Promise<void> }>>(
    async () => ({ remove: vi.fn(async () => undefined) }),
  ),
}));
const prefs = vi.hoisted(() => new Map<string, string>());
const appState = vi.hoisted(() => ({ listeners: [] as ((state: { isActive: boolean }) => void)[], version: "1.0" }));
const localNotifications = vi.hoisted(() => ({
  getPending: vi.fn(async () => ({ notifications: [{ id: 61001 }, { id: 61002 }, { id: 5 }] })),
  cancel: vi.fn(async () => undefined),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }));

vi.mock("@/lib/platform/native", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform/native")>()),
  isNativeApp: () => env.native,
  getNativePlatform: () => env.platform,
}));
vi.mock("@/lib/platform/native-device", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform/native-device")>()),
  cortexDevice: async () => (env.native ? plugin : null),
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value),
    remove: async ({ key }: { key: string }) => void prefs.delete(key),
  },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: async () => ({ version: appState.version, build: "1" }),
    addListener: async (_event: string, handler: (state: { isActive: boolean }) => void) => {
      appState.listeners.push(handler);
      return { remove: async () => undefined };
    },
  },
}));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: localNotifications }));
vi.mock("@/lib/platform/native-push", () => ({ storedPushToken: async () => (env.native ? "cihaz-anahtari-0001" : null) }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  env.native = false;
  env.platform = "web";
  prefs.clear();
  appState.listeners = [];
  appState.version = "1.0";
  for (const fn of Object.values(plugin)) fn.mockClear();
  plugin.biometricVerify.mockImplementation(async () => ({ verified: true }));
  for (const fn of Object.values(toast)) fn.mockClear();
  localNotifications.cancel.mockClear();
  document.documentElement.className = "";
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom */
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ilk betik: kilit", async () => {
  const { NATIVE_BOOT_SCRIPT } = await import("@/lib/platform/native-ua");
  const setUserAgent = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

  it("uygulamada kilit açıksa içerik çizilmeden gizlenir; tarayıcıda hiç", () => {
    window.localStorage.setItem("cp.lock", "1");
    setUserAgent("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CortexPlusApp/1 (ios)");
    new Function(NATIVE_BOOT_SCRIPT)();
    expect(document.documentElement.classList.contains("cx-locked")).toBe(true);
    document.documentElement.className = "";
    setUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0");
    new Function(NATIVE_BOOT_SCRIPT)();
    expect(document.documentElement.classList.contains("cx-locked")).toBe(false);
  });
});

describe("uygulama kilidi katmanı", async () => {
  const { NativeLockGate } = await import("@/components/native/native-lock-gate");

  it("web'de hiçbir şey çizmez ve kilidi kaldırır", async () => {
    document.documentElement.classList.add("cx-locked");
    render(<NativeLockGate />);
    await waitFor(() => expect(document.documentElement.classList.contains("cx-locked")).toBe(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("kilit açıksa doğrulama ister; doğrulanamazsa ekranda kalır, 'Kilidi aç' yeniden dener", async () => {
    env.native = true;
    env.platform = "ios";
    prefs.set("cp.lock.enabled", "1");
    plugin.biometricVerify.mockImplementationOnce(async () => ({ verified: false, reason: "failed" }));
    render(<NativeLockGate />);
    const dialog = await screen.findByRole("dialog", { name: "Cortex Plus kilitli" });
    expect(dialog.textContent).toContain("Doğrulanamadı");
    expect(document.documentElement.classList.contains("cx-locked")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Kilidi aç" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.documentElement.classList.contains("cx-locked")).toBe(false);
    expect(screen.queryByRole("button", { name: "Çıkış yap" })).toBeNull();
  });

  it("telefonda ekran kilidi kalmadıysa kilit kendiliğinden kalkar (öğrenci dışarıda kalmaz)", async () => {
    env.native = true;
    env.platform = "android";
    prefs.set("cp.lock.enabled", "1");
    plugin.biometricStatus.mockImplementationOnce(async () => ({ available: false, biometric: false, kind: "none" }));
    render(<NativeLockGate />);
    await waitFor(() => expect(prefs.has("cp.lock.enabled")).toBe(false));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(plugin.biometricVerify).not.toHaveBeenCalled();
  });

  it("bir dakikadan uzun arka plandan dönünce yeniden kilitlenir; kısa dönüşte kilitlenmez", async () => {
    env.native = true;
    env.platform = "ios";
    prefs.set("cp.lock.enabled", "1");
    render(<NativeLockGate />);
    await waitFor(() => expect(plugin.biometricVerify).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const now = Date.now();
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(now);
    act(() => appState.listeners.forEach((listener) => listener({ isActive: false })));
    spy.mockReturnValue(now + 20_000);
    act(() => appState.listeners.forEach((listener) => listener({ isActive: true })));
    expect(plugin.biometricVerify).toHaveBeenCalledTimes(1);
    spy.mockReturnValue(now + 30_000);
    act(() => appState.listeners.forEach((listener) => listener({ isActive: false })));
    spy.mockReturnValue(now + 120_000);
    act(() => appState.listeners.forEach((listener) => listener({ isActive: true })));
    spy.mockRestore();
    await waitFor(() => expect(plugin.biometricVerify).toHaveBeenCalledTimes(2));
  });
});

describe("Ayarlar: kilit anahtarı", async () => {
  const { AppLockSetting } = await import("@/components/native/app-lock-setting");

  it("web'de çizilmez", () => {
    const { container } = render(<AppLockSetting />);
    expect(container.innerHTML).toBe("");
  });

  it("açmak için bir doğrulama; ad telefonun yöntemine göre", async () => {
    env.native = true;
    env.platform = "ios";
    render(<AppLockSetting />);
    const toggle = await screen.findByRole("switch", { name: "Face ID ile kilitle" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(plugin.biometricVerify).toHaveBeenCalledTimes(1);
    expect(prefs.get("cp.lock.enabled")).toBe("1");
    expect(window.localStorage.getItem("cp.lock")).toBe("1");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(prefs.has("cp.lock.enabled")).toBe(false);
  });
});

describe("zorunlu güncelleme", async () => {
  const { NativeUpdateGate } = await import("@/components/native/native-update-gate");

  it("web'de sunucuya sorulmaz", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<NativeUpdateGate />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("en düşük sürümün altında kapatılamayan ekran ve mağaza bağlantısı", async () => {
    env.native = true;
    env.platform = "android";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "update_required", minimum: "1.2", latest: "1.2", storeUrl: "https://play.google.com/store/apps/details?id=app.cortexplus.mobile" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<NativeUpdateGate />);
    const dialog = await screen.findByRole("alertdialog", { name: "Yeni sürüm gerekli" });
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toBe("/api/app/version?platform=android&version=1.0");
    expect(dialog.querySelector("a")?.getAttribute("href")).toContain("play.google.com");
    expect(screen.queryByRole("button", { name: "Sonra" })).toBeNull();
  });

  it("öneri şeridi kapatılır; App Store kimliği yoksa yol tarif edilir", async () => {
    env.native = true;
    env.platform = "ios";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "update_required", minimum: "2.0", latest: "2.0", storeUrl: null }))));
    const { unmount } = render(<NativeUpdateGate />);
    expect((await screen.findByRole("alertdialog")).textContent).toContain("App Store'u aç");
    unmount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "update_available", minimum: "1.0", latest: "1.1", storeUrl: null }))));
    render(<NativeUpdateGate />);
    expect((await screen.findByRole("status")).textContent).toContain("yeni sürümü hazır");
    fireEvent.click(screen.getByRole("button", { name: "Sonra" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});

describe("düelloda bildir ve engelle", async () => {
  const { DuelPlayerActions } = await import("@/components/duel/duel-player-actions");

  it("bildirim: neden seçilir, not gider; misafir engelleyemez", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    const onBlocked = vi.fn();
    render(<DuelPlayerActions code="abc123" runId="r1" name="Deniz" signedIn={false} onBlocked={onBlocked} />);
    fireEvent.click(screen.getByRole("button", { name: "Deniz için seçenekler" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Engelle/ }));
    expect(toast.message).toHaveBeenCalledWith("Engellemek için giriş yap.");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Deniz için seçenekler" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Bildir/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Hile şüphesi" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Çok hızlı bitirdi" } });
    fireEvent.click(screen.getByRole("button", { name: "Bildirimi gönder" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/duels/abc123/report");
    expect(JSON.parse(String(init.body))).toEqual({ runId: "r1", reason: "cheating", note: "Çok hızlı bitirdi" });
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("engelleme onayla; başarılıysa satır listeden çıkar", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    const onBlocked = vi.fn();
    render(<DuelPlayerActions code="abc123" runId="r9" name="Mert" signedIn onBlocked={onBlocked} />);
    fireEvent.click(screen.getByRole("button", { name: "Mert için seçenekler" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Engelle/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("bir daha görmezsin");
    fireEvent.click(screen.getAllByRole("button", { name: "Engelle" }).at(-1)!);
    await waitFor(() => expect(onBlocked).toHaveBeenCalledWith("r9"));
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/duels/abc123/block");
  });

  it("sıralamada kendi satırında seçenek yok", async () => {
    const { DuelPlay } = await import("@/components/duel/duel-play");
    render(
      <DuelPlay
        code="abc123"
        title="Kısa düello"
        topic={null}
        creatorName="Ece"
        questions={[]}
        initialBoard={[
          { runId: "own", name: "Ben", score: 300, correct: 5, own: true },
          { runId: "r2", name: "Deniz", score: 200, correct: 4, own: false },
        ]}
        signedIn
      />,
    );
    expect(screen.getAllByRole("button", { name: /için seçenekler/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Deniz için seçenekler" })).toBeTruthy();
  });
});

describe("kilit ekranı medya kancası", async () => {
  const { useNativeMediaControls } = await import("@/lib/platform/native-media");
  const input = {
    active: true,
    title: "Bölüm 1",
    album: "Sınav Radyosu",
    playing: true,
    positionMs: 1_000,
    durationMs: 600_000,
    rate: 1,
    canPrevious: true,
    canNext: true,
  };

  it("web'de eklentiye hiç gidilmez", () => {
    renderHook(() => useNativeMediaControls(input, {}));
    expect(plugin.mediaUpdate).not.toHaveBeenCalled();
  });

  it("Android: anlamlı değişimde gönderir, küçük ilerlemede göndermez; düğme olayı işleyiciye; kapanınca bildirim kalkar", async () => {
    env.native = true;
    env.platform = "android";
    const pause = vi.fn();
    const seekto = vi.fn();
    const { rerender, unmount } = renderHook((props: typeof input) => useNativeMediaControls(props, { pause, seekto }), { initialProps: input });
    await waitFor(() => expect(plugin.mediaUpdate).toHaveBeenCalledTimes(1));
    rerender({ ...input, positionMs: 1_400 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(plugin.mediaUpdate).toHaveBeenCalledTimes(1);
    rerender({ ...input, positionMs: 1_400, playing: false });
    await waitFor(() => expect(plugin.mediaUpdate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(plugin.addListener).toHaveBeenCalled());
    const handler = plugin.addListener.mock.calls[0]![1];
    handler({ action: "pause" });
    handler({ action: "seekto", positionMs: 90_000 });
    expect(pause).toHaveBeenCalled();
    expect(seekto).toHaveBeenCalledWith(90_000);
    unmount();
    await waitFor(() => expect(plugin.mediaStop).toHaveBeenCalled());
  });
});

describe("çıkış formu", async () => {
  const { NativePushTokenField } = await import("@/components/native/native-push-token-field");

  it("uygulamada gönderilirken yalnız bizim aralığımızdaki yerel hatırlatmalar silinir; web'de alan yok", async () => {
    const { container, unmount } = render(
      <form onSubmit={(event) => event.preventDefault()}>
        <NativePushTokenField />
        <button type="submit">Çıkış</button>
      </form>,
    );
    expect(container.querySelector("input[name=push_token]")).toBeNull();
    unmount();

    env.native = true;
    env.platform = "ios";
    render(
      <form onSubmit={(event) => event.preventDefault()}>
        <NativePushTokenField />
        <button type="submit">Çıkış</button>
      </form>,
    );
    await waitFor(() => expect(document.querySelector("input[name=push_token]")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Çıkış" }));
    await waitFor(() => expect(localNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 61001 }, { id: 61002 }] }));
  });
});
