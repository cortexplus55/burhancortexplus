/**
 * @vitest-environment jsdom
 *
 * Mobil uygulamanın ilk açılışı (26 Kasım 2026, Aşama 1): yalnız uygulamada ve cihaz başına bir kez; seviye seçimi
 * profile yazılır, kamerayla çekilen sayfalar sunucuya gitmeden kurulumun materyal adımına taşınır, bildirim izni
 * değeri anlatıldıktan sonra istenir. Web'de hiçbir şey çizilmez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));

const native = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/platform/native", () => ({
  isNativeApp: () => native.on,
  triggerHaptic: vi.fn(async () => undefined),
}));

const stored = vi.hoisted(() => new Map<string, string>());
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: stored.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => void stored.set(key, value)),
  },
}));

const photo = new File([new Uint8Array([1, 2, 3])], "defter-1.jpg", { type: "image/jpeg" });
const takeNativePhoto = vi.fn(async () => ({ file: photo }));
vi.mock("@/lib/platform/native-camera", () => ({
  takeNativePhoto: () => takeNativePhoto(),
  CAMERA_PERMISSION_MESSAGE: "izin",
  CAMERA_UNAVAILABLE_MESSAGE: "yok",
}));

const requestPushPermission = vi.fn(async () => true);
vi.mock("@/lib/platform/native-push", () => ({
  pushPermissionState: vi.fn(async () => "prompt"),
  requestPushPermission: () => requestPushPermission(),
}));

const holdGuestDocuments = vi.fn(async (_files: File[]) => ({}));
vi.mock("@/lib/documents/guest-handoff", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/documents/guest-handoff")>();
  return { ...original, holdGuestDocuments: (files: File[]) => holdGuestDocuments(files) };
});

import { NATIVE_ONBOARDING_KEY, NativeOnboardingGate } from "@/components/native/native-onboarding";

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === "/api/app/onboarding" && !init?.method) {
    return new Response(JSON.stringify({ gradeLevel: "12. sınıf", learningGoal: "YKS hazırlık", firstName: "Elif", voiceTutor: true }));
  }
  return new Response(JSON.stringify({ ok: true }));
});

beforeEach(() => {
  native.on = true;
  stored.clear();
  vi.stubGlobal("fetch", fetchMock);
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ilk açılış", () => {
  it("web'de hiçbir şey çizilmez", async () => {
    native.on = false;
    const { container } = render(<NativeOnboardingGate />);
    await act(async () => undefined);
    expect(container.innerHTML).toBe("");
  });

  it("daha önce görüldüyse açılmaz; ders ekranında açılmaz", async () => {
    stored.set(NATIVE_ONBOARDING_KEY, "1");
    const first = render(<NativeOnboardingGate />);
    await act(async () => undefined);
    expect(first.container.innerHTML).toBe("");
    first.unmount();
    stored.clear();
    const session = render(<NativeOnboardingGate suppressed />);
    await act(async () => undefined);
    expect(session.container.innerHTML).toBe("");
  });

  it("seviye → fotoğraf → bildirim: profile yazılır, sayfalar kuruluma taşınır", async () => {
    render(<NativeOnboardingGate />);
    expect(await screen.findByText("Hangi sınava hazırlanıyorsun?")).toBeTruthy();
    expect(await screen.findByText("Hoş geldin Elif!")).toBeTruthy();

    // Kayıttaki seçim ön seçili: Lise / YKS ve 12. sınıf.
    await waitFor(() => expect(screen.getByRole("radio", { name: /Lise \/ YKS/ }).getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByRole("radio", { name: "12. sınıf · YKS" }).getAttribute("aria-checked")).toBe("true");

    // Başka seçim: Uzmanlık → TUS.
    fireEvent.click(screen.getByRole("radio", { name: /KPSS \/ TUS \/ Uzmanlık/ }));
    expect((screen.getByRole("button", { name: "Devam et" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "TUS" }));
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    await screen.findByText("İlk adımı şimdi at");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ group: "uzmanlik", choice: "tus" });

    // Ses açık: canlı sesli öğretmen seçeneği.
    expect(screen.getByText("Canlı sesli öğretmene sor")).toBeTruthy();
    fireEvent.click(screen.getByText("Notunun fotoğrafını çek"));
    await screen.findByText(/1 sayfa hazır/);
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));

    await screen.findByText("Hatırlatmaları açalım mı?");
    expect(screen.getByText("Gece 22:00 ile sabah 08:00 arası hatırlatma göndermeyiz.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bildirimleri aç" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/deneme-sinavlari/olustur"));
    expect(requestPushPermission).toHaveBeenCalledTimes(1);
    expect(holdGuestDocuments).toHaveBeenCalledWith([photo]);
    expect(stored.get(NATIVE_ONBOARDING_KEY)).toBe("1");
  });

  it("seçim kaydedilemezse ilerlemez, hata söylenir", async () => {
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ gradeLevel: null, learningGoal: null, firstName: null, voiceTutor: false })),
    );
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    render(<NativeOnboardingGate />);
    fireEvent.click(await screen.findByRole("radio", { name: /Üniversite/ }));
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Hangi sınava hazırlanıyorsun?")).toBeTruthy();
  });

  it("adımı geçip bildirime 'Şimdi değil' denirse izin istenmez, sayfa değişmez", async () => {
    render(<NativeOnboardingGate />);
    await screen.findByText("Hangi sınava hazırlanıyorsun?");
    await waitFor(() => expect((screen.getByRole("button", { name: "Devam et" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    await screen.findByText("İlk adımı şimdi at");
    fireEvent.click(screen.getByRole("button", { name: "Bu adımı geç" }));
    await screen.findByText("Hatırlatmaları açalım mı?");
    fireEvent.click(screen.getByRole("button", { name: "Şimdi değil" }));
    await waitFor(() => expect(stored.get(NATIVE_ONBOARDING_KEY)).toBe("1"));
    expect(requestPushPermission).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
