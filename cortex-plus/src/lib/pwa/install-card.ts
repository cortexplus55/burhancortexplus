import type { InstallPlatform } from "@/lib/pwa/install-platform";

/**
 * "📱 Telefonuna Uygulama Gibi Ekle" kartı (20 Kasım 2026, Faz 8, ürün sahibi). Kartın ne zaman çıkacağı tek
 * saf işlevde (`installCardMode`); bileşen yalnız tarayıcıdan okuduklarını buraya verir.
 *
 * Kart yalnız şunların hepsi tutunca çıkar:
 * - öğrenci ilk adımını atmış (ilk hazırlığını kurmuş ya da ilk dersini bitirmiş: kartın konduğu sayfa söyler),
 * - telefon (tarayıcı kimliği Android ya da iPhone, ve dokunmatik ekran ya da dar pencere),
 * - uygulama zaten ana ekrandan açılmamış ve bu cihazda kurulduğu görülmemiş,
 * - Instagram / Facebook / TikTok / WhatsApp'ın kendi tarayıcısı değil (kurulum yapamazlar; "tarayıcıda aç" şeridi var),
 * - kart son 30 günde gösterilmemiş (en çok 30 günde bir).
 *
 * Android'de tarayıcı kurulum olayını göndermediyse kart çıkmaz: olay gelmiyorsa uygulama zaten kurulu olabilir,
 * kurulu öğrenciye "ekle" denmez. iOS bu olayı hiç göndermez; Safari'nin iki adımı gösterilir. Çevrimdışı çalışma
 * ya da bildirim sözü verilmez (ikisi de yok).
 */

export const INSTALL_CARD_STORAGE_KEY = "cp:install-card";
export const INSTALL_CARD_COOLDOWN_DAYS = 30;
export const INSTALL_CARD_COOLDOWN_MS = INSTALL_CARD_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export const INSTALL_CARD_TITLE = "Telefonuna Uygulama Gibi Ekle";
export const INSTALL_CARD_ACTION = "Ana Ekrana Ekle";
export const INSTALL_CARD_LATER = "Şimdi değil";
export const INSTALL_CARD_ANDROID_NOTE = "Tek dokunuşla ekle; Cortex Plus ana ekranından kendi penceresinde açılır.";
/** Ürün sahibinin cümlesi: "Alttaki Paylaş simgesine dokun → 'Ana Ekrana Ekle'yi seç." İki adım olarak. */
export const INSTALL_CARD_IOS_STEPS = ["Alttaki Paylaş simgesine dokun", "'Ana Ekrana Ekle'yi seç"] as const;

/** Kartın konduğu sayfanın bildiği ilk adım. */
export type InstallMilestone = "prep_created" | "lesson_completed";
export type InstallCardMode = "android" | "ios";

export type InstallCardMemory = {
  /** Kartın en son gösterildiği ya da kapatıldığı an (ms). */
  lastAt: number | null;
  /** Bu cihazda kurulum görüldü (`appinstalled` ya da kabul): kart bir daha çıkmaz. */
  installed: boolean;
};

export type InstallCardInput = {
  platform: InstallPlatform | null;
  /** `inAppBrowserApp(userAgent)`: uygulamanın kendi tarayıcısı (Instagram, Facebook, TikTok, WhatsApp). */
  inAppBrowser: string | null;
  standalone: boolean;
  coarsePointer: boolean;
  narrowViewport: boolean;
  milestone: InstallMilestone | null;
  /** Android: tarayıcının kurulum olayı saklı mı. */
  promptAvailable: boolean;
  /** Bu belgede kurulum görüldü mü (`appinstalled`). */
  installedNow: boolean;
  memory: InstallCardMemory;
  now: number;
};

export const EMPTY_INSTALL_CARD_MEMORY: InstallCardMemory = { lastAt: null, installed: false };

export function installCardMode(input: InstallCardInput): InstallCardMode | null {
  if (!input.milestone) return null;
  if (input.standalone || input.installedNow || input.memory.installed) return null;
  if (input.inAppBrowser || input.platform === "webview") return null;
  if (input.platform !== "android" && input.platform !== "ios") return null;
  if (!input.coarsePointer && !input.narrowViewport) return null;
  // Saat geri alınmışsa (son gösterim "gelecekte") de bekleme süresinde sayılır: kart erken çıkmasın.
  if (input.memory.lastAt != null && input.now - input.memory.lastAt < INSTALL_CARD_COOLDOWN_MS) return null;
  if (input.platform === "ios") return "ios";
  return input.promptAvailable ? "android" : null;
}

export function parseInstallCardMemory(raw: string | null | undefined): InstallCardMemory {
  if (!raw) return EMPTY_INSTALL_CARD_MEMORY;
  try {
    const value = JSON.parse(raw) as { lastAt?: unknown; installed?: unknown } | null;
    if (!value || typeof value !== "object") return EMPTY_INSTALL_CARD_MEMORY;
    const lastAt = typeof value.lastAt === "number" && Number.isFinite(value.lastAt) ? value.lastAt : null;
    return { lastAt, installed: value.installed === true };
  } catch {
    return EMPTY_INSTALL_CARD_MEMORY;
  }
}

/*
  Tarayıcı deposu yazılamıyorsa (gizli pencere, engellenmiş site verisi) bu belge boyunca bellekte tutulur: kart
  aynı ziyarette ikinci kez çıkmaz.
*/
let memoryFallback: InstallCardMemory | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readInstallCardMemory(): InstallCardMemory {
  const store = storage();
  let stored = EMPTY_INSTALL_CARD_MEMORY;
  try {
    stored = parseInstallCardMemory(store?.getItem(INSTALL_CARD_STORAGE_KEY));
  } catch {
    stored = EMPTY_INSTALL_CARD_MEMORY;
  }
  if (!memoryFallback) return stored;
  return {
    lastAt: Math.max(stored.lastAt ?? 0, memoryFallback.lastAt ?? 0) || null,
    installed: stored.installed || memoryFallback.installed,
  };
}

export function writeInstallCardMemory(patch: Partial<InstallCardMemory>): void {
  const next = { ...readInstallCardMemory(), ...patch };
  const store = storage();
  try {
    if (!store) throw new Error("storage_unavailable");
    store.setItem(INSTALL_CARD_STORAGE_KEY, JSON.stringify(next));
    memoryFallback = null;
  } catch {
    // Yazılamadı: bellekteki kopya bu ziyaret boyunca geçerli.
    memoryFallback = next;
  }
}
