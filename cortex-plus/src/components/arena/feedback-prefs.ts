"use client";

import { useCallback, useEffect, useState } from "react";

/*
  Ses ve titreşim tercihi (Faz 4A, ANA-PROMPT §3.11): VARSAYILAN KAPALI; ses dosyası ve ses düğmesi YOK. Tercih yalnız bu
  cihazda (`localStorage`, okunamazsa varsayılan). Bugün hiçbir ekran sesi çalmaz; titreşim yalnız tercih açıksa.
*/

const KEY = "cx-feedback-prefs";
export type FeedbackPrefs = { sound: boolean; haptics: boolean };
export const DEFAULT_FEEDBACK_PREFS: FeedbackPrefs = { sound: false, haptics: false };

export function readFeedbackPrefs(): FeedbackPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_FEEDBACK_PREFS;
    const parsed = JSON.parse(raw) as Partial<FeedbackPrefs>;
    return { sound: parsed.sound === true, haptics: parsed.haptics === true };
  } catch {
    return DEFAULT_FEEDBACK_PREFS;
  }
}

export function useFeedbackPrefs(): [FeedbackPrefs, (next: Partial<FeedbackPrefs>) => void] {
  const [prefs, setPrefs] = useState<FeedbackPrefs>(DEFAULT_FEEDBACK_PREFS);
  useEffect(() => setPrefs(readFeedbackPrefs()), []);
  const update = useCallback((next: Partial<FeedbackPrefs>) => {
    setPrefs((current) => {
      const value = { ...current, ...next };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        // tercih bu oturumda kalır
      }
      return value;
    });
  }, []);
  return [prefs, update];
}
