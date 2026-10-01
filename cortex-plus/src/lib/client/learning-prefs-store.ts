"use client";

import { parseTutorVoice, type TutorVoice } from "@/lib/student/learning-prefs";

/**
 * Tarayıcıdaki tercih deposu. Okunabilir yazı, öğretmen sesi ve önerilen
 * sorular birçok bileşende okunuyor (sohbet, ders, sesli dinle); hepsine
 * prop taşımak yerine tek yer. Asıl kayıt profilde; burası oturum başına bir
 * kez profilden doldurulur ve ayar değişince hemen güncellenir.
 */

export type ClientLearningPrefs = { readable: boolean; voice: TutorVoice; suggestions: boolean };

const KEY = "cortex-learning-prefs";
const SYNCED = "cortex-learning-prefs-synced";
export const PREFS_EVENT = "cortex-learning-prefs";
const DEFAULTS: ClientLearningPrefs = { readable: false, voice: "female", suggestions: true };

export function readLearningPrefs(): ClientLearningPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ClientLearningPrefs>;
    return {
      readable: parsed.readable === true,
      voice: parseTutorVoice(parsed.voice),
      suggestions: parsed.suggestions !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function applyReadable(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.dataset.readable = "1";
  else delete document.documentElement.dataset.readable;
}

export function writeLearningPrefs(patch: Partial<ClientLearningPrefs>): ClientLearningPrefs {
  const next = { ...readLearningPrefs(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Gizli pencerede depolama kapalı olabilir; tercih bu sayfada yine uygulanır.
  }
  applyReadable(next.readable);
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: next }));
  return next;
}

/** Profil cevabından depoyu doldurur (GET /api/profile/me). */
export function prefsFromProfile(data: {
  readable_font?: unknown;
  tutor_voice?: unknown;
  show_suggestions?: unknown;
}): Partial<ClientLearningPrefs> {
  return {
    readable: data.readable_font === true,
    voice: parseTutorVoice(data.tutor_voice),
    suggestions: data.show_suggestions !== false,
  };
}

/** Sekme oturumunda bir kez profilden eşitle; önce yereldekini hemen uygula. */
export function syncLearningPrefsOnce() {
  applyReadable(readLearningPrefs().readable);
  try {
    if (window.sessionStorage.getItem(SYNCED)) return;
    window.sessionStorage.setItem(SYNCED, "1");
  } catch {
    // Depolama kapalıysa her sayfada eşitlemek yerine hiç eşitleme.
    return;
  }
  void fetch("/api/profile/me")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data) writeLearningPrefs(prefsFromProfile(data));
    })
    .catch(() => undefined);
}
