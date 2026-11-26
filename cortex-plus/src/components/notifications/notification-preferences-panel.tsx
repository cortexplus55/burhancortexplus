"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { BellOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PREFERENCE_LABELS, type PreferenceKey } from "@/lib/notifications/preferences";
import { STUDY_SLOTS, type StudyHour } from "@/lib/notifications/schedule";
import { REMINDERS_CHANGED_EVENT } from "@/lib/platform/native-reminders";
import {
  ALL_OFF_DONE,
  ALL_OFF_LABEL,
  PREFERENCE_SAVE_ERROR,
  PREFERENCE_SAVED,
  QUIET_HOURS_NOTE,
  STUDY_TIME_HINT,
  STUDY_TIME_TITLE,
} from "@/lib/notifications/preference-copy";
import { cn } from "@/lib/utils";
import "@/styles/notification-preferences.css";

/**
 * Bildirim ve e-posta tercihleri (Faz 6, 20 Kasım 2026): dört anahtar ve hatırlatma saati. Ayarlar (oturumlu,
 * `/api/notification-preferences`) ve e-postadaki bağlantının açtığı sayfa (anahtarlı, `/api/bildirim-tercihleri`)
 * aynı paneli kullanır. Değişiklik hemen görünür; kayıt düşerse yalnız o alan eski hâline döner ve hata yazılır.
 * Kampanya izni bu panelde değil (yasal onay kanıtıyla ayrı kart).
 */

export type PanelPreferences = Record<PreferenceKey, boolean> & { preferredStudyHour: StudyHour };

export type PreferencesMode = { kind: "session" } | { kind: "token"; token: string };

export const PREFERENCE_KEYS: readonly PreferenceKey[] = [
  "studyRemindersEmail",
  "examCountdownEmail",
  "weeklyDigestEmail",
  "inAppNotifications",
];

type Patch = Partial<PanelPreferences>;
type Status = { tone: "ok" | "error"; text: string } | null;

function endpointOf(mode: PreferencesMode) {
  return mode.kind === "token" ? "/api/bildirim-tercihleri" : "/api/notification-preferences";
}

export function NotificationPreferencesPanel({
  initial,
  mode,
  showAllOff = false,
}: {
  initial: PanelPreferences;
  mode: PreferencesMode;
  /** E-postadaki bağlantının sayfası: bütün anahtarları tek düğmeyle kapatır. */
  showAllOff?: boolean;
}) {
  const [prefs, setPrefs] = useState<PanelPreferences>(initial);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState<Status>(null);
  const current = useRef(prefs);
  current.current = prefs;
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const timeTitleId = useId();

  async function save(patch: Patch, doneText: string = PREFERENCE_SAVED) {
    const keys = Object.keys(patch) as (keyof PanelPreferences)[];
    const before: Patch = {};
    for (const key of keys) (before as Record<string, unknown>)[key] = current.current[key];
    setPrefs((value) => ({ ...value, ...patch }));
    setSaving((value) => new Set([...value, ...keys]));
    setStatus(null);
    try {
      const response = await fetch(endpointOf(mode), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode.kind === "token" ? { token: mode.token, patch } : patch),
      });
      if (!response.ok) throw new Error(`save_${response.status}`);
      setStatus({ tone: "ok", text: doneText });
      // Mobil uygulamada telefondaki yerel çalışma hatırlatmaları yeni saat ve tercihle yeniden kurulur (web'de dinleyen yok).
      if (typeof window !== "undefined") window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
    } catch {
      // Yalnız bu kaydın alanları geri döner (arada başka bir alan değiştiyse o kalır).
      setPrefs((value) => {
        const next = { ...value } as Record<string, unknown>;
        for (const key of keys) {
          if (next[key] === (patch as Record<string, unknown>)[key]) next[key] = (before as Record<string, unknown>)[key];
        }
        return next as PanelPreferences;
      });
      setStatus({ tone: "error", text: PREFERENCE_SAVE_ERROR });
    } finally {
      setSaving((value) => {
        const next = new Set(value);
        for (const key of keys) next.delete(key);
        return next;
      });
    }
  }

  function pickSlot(hour: StudyHour) {
    if (hour === current.current.preferredStudyHour) return;
    void save({ preferredStudyHour: hour });
  }

  function onSlotKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const nextIndex = (index + step + STUDY_SLOTS.length) % STUDY_SLOTS.length;
    slotRefs.current[nextIndex]?.focus();
    pickSlot(STUDY_SLOTS[nextIndex]!.hour);
  }

  const allOff = PREFERENCE_KEYS.every((key) => !prefs[key]);

  return (
    <div className="cx-np">
      <ul className="cx-np-rows">
        {PREFERENCE_KEYS.map((key) => (
          <li key={key} className="cx-np-row">
            <span className="cx-np-row-text">
              <span className="cx-np-row-title">{PREFERENCE_LABELS[key].title}</span>
              <span className="cx-np-row-hint">{PREFERENCE_LABELS[key].hint}</span>
            </span>
            <Switch
              aria-label={PREFERENCE_LABELS[key].title}
              checked={prefs[key]}
              disabled={saving.has(key)}
              onCheckedChange={(value) => void save({ [key]: value })}
            />
          </li>
        ))}
      </ul>

      <div className="cx-np-time">
        <span className="cx-np-row-text">
          <span className="cx-np-row-title" id={timeTitleId}>
            {STUDY_TIME_TITLE}
          </span>
          <span className="cx-np-row-hint">{STUDY_TIME_HINT}</span>
        </span>
        <div className="cx-np-slots" role="radiogroup" aria-labelledby={timeTitleId}>
          {STUDY_SLOTS.map((slot, index) => {
            const checked = prefs.preferredStudyHour === slot.hour;
            return (
              <button
                key={slot.hour}
                ref={(node) => {
                  slotRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={`${STUDY_TIME_TITLE}: ${slot.label}`}
                tabIndex={checked ? 0 : -1}
                disabled={saving.has("preferredStudyHour")}
                className={cn("cx-np-slot", checked && "is-active")}
                onClick={() => pickSlot(slot.hour)}
                onKeyDown={(event) => onSlotKey(event, index)}
              >
                {slot.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="cx-np-note">{QUIET_HOURS_NOTE}</p>

      {showAllOff ? (
        <button
          type="button"
          className="cx-np-alloff cx-weak"
          aria-label={ALL_OFF_LABEL}
          disabled={allOff || saving.size > 0}
          onClick={() =>
            void save(
              { studyRemindersEmail: false, examCountdownEmail: false, weeklyDigestEmail: false, inAppNotifications: false },
              ALL_OFF_DONE,
            )
          }
        >
          <BellOff aria-hidden />
          {ALL_OFF_LABEL}
        </button>
      ) : null}

      {status?.tone === "error" ? (
        <p className="cx-np-status is-error" role="alert">
          {status.text}
        </p>
      ) : null}
      <p className="cx-np-status" role="status" aria-live="polite">
        {status?.tone === "ok" ? status.text : ""}
      </p>
    </div>
  );
}
