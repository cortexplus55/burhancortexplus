import { useSyncExternalStore } from "react";

/**
 * Tarayıcının kurulum olayı için tek depo (20 Kasım 2026, Faz 8 "Telefonuna Uygulama Gibi Ekle").
 *
 * Android Chrome kurulabilir sitede `beforeinstallprompt` olayını belge başına bir kez gönderir. Olayı
 * dinleyen yoksa olay kaybolur; öğrenci sonra başka bir sayfaya (sayfa yenilenmeden) geçince kurulum
 * düğmesi hiç çıkmazdı. Bu yüzden olay öğrenci kabuğunda yakalanır (`InstallPromptCapture`), burada saklanır;
 * hazırlık sayfasındaki kart ve `/mobil-uygulama` aynı olayı buradan okur. iOS bu olayı hiç göndermez.
 *
 * Olay tek kullanımlıktır: `prompt()` bir kez çağrılınca saklanan olay silinir.
 */

/** Tarayıcının kurulum olayı (standart tip kütüphanesinde yok). */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

export type InstallPromptState = {
  /** Saklanan kurulum olayı; yoksa tek dokunuşlu kurulum bu belgede yapılamaz. */
  prompt: InstallPromptEvent | null;
  /** Bu belgede `appinstalled` geldi ya da öğrenci kurulumu kabul etti. */
  installed: boolean;
};

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

const SERVER_STATE: InstallPromptState = { prompt: null, installed: false };

let state: InstallPromptState = SERVER_STATE;
let attached = false;
const listeners = new Set<() => void>();

function publish(next: InstallPromptState) {
  state = next;
  for (const listener of listeners) listener();
}

function onBeforeInstallPrompt(event: Event) {
  // Tarayıcının kendi kurulum şeridi çıkmasın: kurulum, uygun anda bizim kartımızdan istenir.
  event.preventDefault();
  publish({ ...state, prompt: event as InstallPromptEvent });
}

function onAppInstalled() {
  publish({ prompt: null, installed: true });
}

/** Dinleyicileri bir kez bağlar (sunucuda hiçbir şey yapmaz). */
export function captureInstallPrompt(): void {
  if (attached || typeof window === "undefined") return;
  attached = true;
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onAppInstalled);
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  captureInstallPrompt();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function installPromptState(): InstallPromptState {
  return state;
}

/** Sunucuda ve hidrasyonda boş durum (iki çizim aynı kalsın); tarayıcıda saklanan olay. */
export function useInstallPrompt(): InstallPromptState {
  return useSyncExternalStore(subscribeInstallPrompt, installPromptState, () => SERVER_STATE);
}

/**
 * Tarayıcının kurulum penceresini açar. Olay tek kullanımlık: pencere açılmadan önce depodan silinir,
 * ikinci dokunuş aynı olayı yeniden kullanmaz.
 */
export async function promptInstall(): Promise<InstallOutcome> {
  const prompt = state.prompt;
  if (!prompt) return "unavailable";
  publish({ ...state, prompt: null });
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      publish({ prompt: null, installed: true });
      return "accepted";
    }
    return "dismissed";
  } catch {
    return "dismissed";
  }
}

/** Uygulama ana ekrandan (kendi penceresinde) açık mı: Android/Chrome `display-mode`, iOS `navigator.standalone`. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/*
  Modül yüklenir yüklenmez dinle (öğrenci kabuğu bu modülü içe aktarır): olay, React sayfayı canlandırmadan önce
  gelirse de kaçmasın.
*/
captureInstallPrompt();
