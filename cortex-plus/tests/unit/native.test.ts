/**
 * @vitest-environment jsdom
 *
 * Mobil uygulama, Aşama 1 (26 Kasım 2026): web ile iOS/Android ayrımı ve telefon yetenekleri.
 * - Karar önce köprüden (window.Capacitor), köprü yoksa tarayıcı kimliğindeki "CortexPlusApp" işaretinden.
 * - Web'de hiçbir davranış değişmez: titreşim eklentisi hiç yüklenmez, paylaşım tarayıcının kendisi ya da kopyalama.
 * - İlk betik yalnız uygulamada <html>e sınıf yazar; iOS'ta viewport-fit=cover ekler.
 * - Google girişi uygulamada gizlenir, "Tarayıcıda aç" şeridi ve kurulum kartı uygulamada çıkmaz.
 * - Bildirim ve uygulamayı açan bağlantılar yalnız kendi yollarımıza gider.
 * - Açılış akışının seçimleri kayıttaki sınıf ve hedef listelerinden.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const haptics = {
  impact: vi.fn(async () => undefined),
  notification: vi.fn(async () => undefined),
  selectionStart: vi.fn(async () => undefined),
  selectionChanged: vi.fn(async () => undefined),
  selectionEnd: vi.fn(async () => undefined),
};
const share = vi.fn(async (_options: unknown) => ({}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: haptics,
  ImpactStyle: { Heavy: "HEAVY", Medium: "MEDIUM", Light: "LIGHT" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));
vi.mock("@capacitor/share", () => ({ Share: { share } }));

import { getNativePlatform, isNativeApp, nativeShare, triggerHaptic } from "@/lib/platform/native";
import { NATIVE_BOOT_SCRIPT, isNativeUserAgent, nativePlatformFromUserAgent } from "@/lib/platform/native-ua";
import { appUrlPath, pushActionPath } from "@/lib/platform/native-links";
import { LEVEL_GROUPS, preselectLevel, resolveLevelChoice } from "@/lib/platform/native-onboarding";
import { GOAL_OPTIONS, GRADE_OPTIONS } from "@/lib/parity/signup";
import { NATIVE_APP_LABEL, googleBlockedWebViewApp, inAppBrowserApp } from "@/lib/auth/in-app-browser";
import { installPlatform, installSteps } from "@/lib/pwa/install-platform";
import { installCardMode } from "@/lib/pwa/install-card";

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
const APP_IOS = `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CortexPlusApp/1 (ios)`;
const APP_ANDROID = `Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 CortexPlusApp/1 (android)`;
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
}

function setBridge(platform: "ios" | "android" | null) {
  const target = window as unknown as { Capacitor?: unknown };
  if (platform) target.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };
  else delete target.Capacitor;
}

beforeEach(() => {
  vi.clearAllMocks();
  setBridge(null);
  setUserAgent(DESKTOP);
});

afterEach(() => {
  setBridge(null);
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-native-platform");
});

describe("web ile iOS / Android ayrımı", () => {
  it("tarayıcıda (masaüstü, Safari, Chrome) her zaman web", () => {
    for (const ua of [DESKTOP, SAFARI, CHROME_ANDROID]) {
      setUserAgent(ua);
      expect(isNativeApp()).toBe(false);
      expect(getNativePlatform()).toBe("web");
    }
  });

  it("köprü varsa platform köprüden: iOS ve Android", () => {
    setBridge("ios");
    expect(isNativeApp()).toBe(true);
    expect(getNativePlatform()).toBe("ios");
    setBridge("android");
    expect(getNativePlatform()).toBe("android");
  });

  it("köprü yüklenmeden önce tarayıcı kimliğindeki işaretten", () => {
    setUserAgent(APP_IOS);
    expect(getNativePlatform()).toBe("ios");
    setUserAgent(APP_ANDROID);
    expect(getNativePlatform()).toBe("android");
  });

  it("köprü yerel değilse (web derlemesi) işarete bakılır, yoksa web", () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => false, getPlatform: () => "web" };
    expect(getNativePlatform()).toBe("web");
  });

  it("tarayıcı kimliği çözümü saf: platform yazılı değilse kimlikten çıkarılır", () => {
    expect(nativePlatformFromUserAgent(APP_IOS)).toBe("ios");
    expect(nativePlatformFromUserAgent(APP_ANDROID)).toBe("android");
    expect(nativePlatformFromUserAgent("Mozilla/5.0 (Linux; Android 14) CortexPlusApp/1")).toBe("android");
    expect(nativePlatformFromUserAgent("Mozilla/5.0 (iPhone) CortexPlusApp/2")).toBe("ios");
    expect(nativePlatformFromUserAgent(SAFARI)).toBeNull();
    expect(nativePlatformFromUserAgent("CortexPlusAppX")).toBeNull();
    expect(nativePlatformFromUserAgent(null)).toBeNull();
    expect(isNativeUserAgent(APP_ANDROID)).toBe(true);
  });

  it("yapılandırma tarayıcı kimliğine aynı işareti ekliyor", () => {
    const config = readFileSync("capacitor.config.ts", "utf8");
    expect(config).toContain('appendUserAgent: "CortexPlusApp/1 (ios)"');
    expect(config).toContain('appendUserAgent: "CortexPlusApp/1 (android)"');
    expect(config).toContain('appId: "app.cortexplus.mobile"');
    expect(config).toContain('url: PRODUCTION_URL');
    expect(config).toContain('"https://cortexplus.app"');
    expect(config).toContain('"#05070E"');
  });
});

describe("ilk betik", () => {
  function runBoot(ua: string) {
    setUserAgent(ua);
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
    new Function(NATIVE_BOOT_SCRIPT)();
    return document.querySelector('meta[name="viewport"]')!.getAttribute("content");
  }

  it("tarayıcıda hiçbir şey değişmez", () => {
    expect(runBoot(SAFARI)).toBe("width=device-width, initial-scale=1");
    expect(document.documentElement.classList.contains("cx-native")).toBe(false);
  });

  it("iOS uygulamasında sınıf, platform ve viewport-fit=cover", () => {
    expect(runBoot(APP_IOS)).toBe("width=device-width, initial-scale=1, viewport-fit=cover");
    expect(document.documentElement.classList.contains("cx-native")).toBe(true);
    expect(document.documentElement.getAttribute("data-native-platform")).toBe("ios");
  });

  it("iOS: iki etiketin ikisi de ve sonradan eklenen etiket de düzeltilir (üretim derlemesi)", async () => {
    setUserAgent(APP_IOS);
    document.head.innerHTML =
      '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="viewport" content="width=device-width">';
    new Function(NATIVE_BOOT_SCRIPT)();
    const late = document.createElement("meta");
    late.setAttribute("name", "viewport");
    late.setAttribute("content", "width=device-width, initial-scale=1");
    document.body.appendChild(late);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const contents = [...document.querySelectorAll('meta[name="viewport"]')].map((meta) => meta.getAttribute("content"));
    expect(contents).toHaveLength(3);
    for (const content of contents) expect(content).toContain("viewport-fit=cover");
    late.remove();
  });

  it("Android uygulamasında sınıf var, görünüm alanı aynen (web görünümü sistem çubuklarının arasında)", () => {
    expect(runBoot(APP_ANDROID)).toBe("width=device-width, initial-scale=1");
    expect(document.documentElement.getAttribute("data-native-platform")).toBe("android");
  });
});

describe("dokunsal geri bildirim", () => {
  it("web'de eklenti hiç çağrılmaz", async () => {
    await triggerHaptic("success");
    await triggerHaptic("light");
    expect(haptics.notification).not.toHaveBeenCalled();
    expect(haptics.impact).not.toHaveBeenCalled();
  });

  it("uygulamada türüne göre: darbe, sonuç, seçim", async () => {
    setBridge("ios");
    await triggerHaptic("medium");
    expect(haptics.impact).toHaveBeenCalledWith({ style: "MEDIUM" });
    await triggerHaptic("error");
    expect(haptics.notification).toHaveBeenCalledWith({ type: "ERROR" });
    await triggerHaptic("selection");
    expect(haptics.selectionChanged).toHaveBeenCalledTimes(1);
  });

  it("eklenti düşerse akış sürer (atmaz)", async () => {
    setBridge("android");
    haptics.impact.mockRejectedValueOnce(new Error("unsupported"));
    await expect(triggerHaptic("light")).resolves.toBeUndefined();
  });
});

describe("paylaşım", () => {
  it("uygulamada telefonun paylaşım ekranı", async () => {
    setBridge("android");
    await expect(nativeShare({ title: "Hazırlık", url: "https://cortexplus.app/davet/ABC" })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Hazırlık", url: "https://cortexplus.app/davet/ABC", dialogTitle: "Hazırlık" }),
    );
  });

  it("uygulamada menü kapatılırsa iptal", async () => {
    setBridge("ios");
    share.mockRejectedValueOnce(new Error("Share canceled"));
    await expect(nativeShare({ url: "https://cortexplus.app" })).resolves.toBe("cancelled");
  });

  it("web'de tarayıcının paylaşımı yoksa bağlantı kopyalanır; eklenti çağrılmaz", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    await expect(nativeShare({ text: "Bak", url: "https://cortexplus.app/x" })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Bak https://cortexplus.app/x");
    expect(share).not.toHaveBeenCalled();
  });

  it("paylaşılacak bir şey yoksa", async () => {
    await expect(nativeShare({ title: " " })).resolves.toBe("unavailable");
  });
});

describe("bağlantılar yalnız kendi yollarımıza", () => {
  it("bildirim yolu: yalnız '/...'", () => {
    expect(pushActionPath({ url: "/deneme-sinavlari/abc/tekrar" })).toBe("/deneme-sinavlari/abc/tekrar");
    expect(pushActionPath({ url: "https://kotu.example" })).toBeNull();
    expect(pushActionPath({ url: "//kotu.example" })).toBeNull();
    expect(pushActionPath({ url: "/a\\b" })).toBeNull();
    expect(pushActionPath(null)).toBeNull();
    expect(pushActionPath({ url: 5 })).toBeNull();
  });

  it("uygulamayı açan adres: kendi alan adımız ve uygulama şeması", () => {
    expect(appUrlPath("https://cortexplus.app/davet/ABCD?otomatik=1")).toBe("/davet/ABCD?otomatik=1");
    expect(appUrlPath("https://www.cortexplus.app/ogretmen")).toBe("/ogretmen");
    expect(appUrlPath("app.cortexplus.mobile://deneme-sinavlari/abc")).toBe("/deneme-sinavlari/abc");
    expect(appUrlPath("https://cortexplus.app.kotu.example/x")).toBeNull();
    expect(appUrlPath("http://cortexplus.app/x")).toBeNull();
    expect(appUrlPath("javascript:alert(1)")).toBeNull();
    expect(appUrlPath("bozuk")).toBeNull();
  });
});

describe("Google girişi, tarayıcıda aç şeridi ve kurulum kartı uygulamada", () => {
  it("uygulamada Google düğmesi yerine uygulama notu; şerit yok", () => {
    expect(googleBlockedWebViewApp(APP_ANDROID)).toBe(NATIVE_APP_LABEL);
    expect(googleBlockedWebViewApp(APP_IOS)).toBe(NATIVE_APP_LABEL);
    expect(inAppBrowserApp(APP_ANDROID)).toBeNull();
    expect(inAppBrowserApp("Mozilla/5.0 Instagram 300.0")).toBe("Instagram");
    expect(googleBlockedWebViewApp(SAFARI)).toBeNull();
  });

  it("uygulamada kurulum adımı yok ve kurulum kartı çıkmaz", () => {
    expect(installPlatform(APP_IOS)).toBe("app");
    expect(installSteps("app")).toEqual([]);
    expect(installPlatform(SAFARI)).toBe("ios");
    expect(
      installCardMode({
        milestone: "lesson_completed",
        standalone: false,
        installedNow: false,
        memory: { lastAt: null, installed: false },
        inAppBrowser: null,
        platform: "app",
        coarsePointer: true,
        narrowViewport: true,
        now: Date.now(),
        promptAvailable: true,
      }),
    ).toBeNull();
  });
});

describe("açılış akışı: seviye seçimleri", () => {
  it("her seçim kayıttaki sınıf ve hedef listelerinden", () => {
    const goals = new Set(GOAL_OPTIONS.map((goal) => goal.label));
    const grades = new Set<string>(GRADE_OPTIONS);
    expect(LEVEL_GROUPS.map((group) => group.id)).toEqual(["ortaokul", "lise", "universite", "uzmanlik"]);
    for (const group of LEVEL_GROUPS) {
      expect(group.choices.length).toBeGreaterThan(0);
      for (const choice of group.choices) {
        expect(grades.has(choice.gradeLevel), choice.label).toBe(true);
        expect(goals.has(choice.learningGoal), choice.label).toBe(true);
      }
    }
  });

  it("seçimin profil karşılığı; tanınmayan seçim reddedilir", () => {
    expect(resolveLevelChoice("ortaokul", "8")).toMatchObject({ gradeLevel: "8. sınıf", learningGoal: "LGS hazırlık" });
    expect(resolveLevelChoice("uzmanlik", "tus")).toMatchObject({ gradeLevel: "Mezun", learningGoal: "TUS hazırlık" });
    expect(resolveLevelChoice("universite", "universite")).toMatchObject({ learningGoal: "Üniversite vize ve final" });
    expect(resolveLevelChoice("lise", "8")).toBeNull();
    expect(resolveLevelChoice("yok", "8")).toBeNull();
  });

  it("kayıtta seçilen sınıf ve hedef ön seçili gelir", () => {
    expect(preselectLevel("12. sınıf", "YKS hazırlık")).toEqual({ groupId: "lise", choiceId: "12" });
    expect(preselectLevel("Mezun", "KPSS hazırlık")).toEqual({ groupId: "uzmanlik", choiceId: "kpss" });
    expect(preselectLevel("Üniversite", null)).toEqual({ groupId: "universite", choiceId: "universite" });
    expect(preselectLevel("6. sınıf", "Okul sınavları")).toEqual({ groupId: "ortaokul", choiceId: "6" });
    expect(preselectLevel(null, null)).toBeNull();
  });
});
