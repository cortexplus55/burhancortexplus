"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Camera, Check, ImagePlus, MessageCircle, Mic } from "lucide-react";
import { toast } from "sonner";
import { isNativeApp, triggerHaptic } from "@/lib/platform/native";
import {
  CAMERA_PERMISSION_MESSAGE,
  CAMERA_UNAVAILABLE_MESSAGE,
  takeNativePhoto,
} from "@/lib/platform/native-camera";
import { LEVEL_GROUPS, levelGroup, preselectLevel, type LevelGroupId } from "@/lib/platform/native-onboarding";
import { pushPermissionState, requestPushPermission, type PushPermission } from "@/lib/platform/native-push";
import {
  GUEST_DOCUMENT_NEXT,
  GUEST_HANDOFF_MAX_FILES,
  holdGuestDocuments,
  pickGuestFiles,
} from "@/lib/documents/guest-handoff";

/**
 * Mobil uygulamanın ilk açılışı (26 Kasım 2026, Aşama 1). Yalnız uygulamada, cihaz başına bir kez; web'de hiç çizilmez.
 *
 * 1. Seviye ve sınav: dört grup, sonra kesin seçim; profildeki sınıf ve hedefe yazılır (`/api/app/onboarding`).
 *    Kayıtta seçilmişse ön seçili gelir, öğrenci tek dokunuşla geçer.
 * 2. İlk adım: notunun fotoğrafını çek (telefonun kamerası, en çok 10 sayfa, galeriden de eklenir) ya da öğretmene sor
 *    (teacher.v2 açıksa "Canlı sesli öğretmene sor"). Fotoğraflar sunucuya burada gitmez: tarayıcıda bekler ve kurulumun
 *    materyal adımında bildiğimiz yükleme hattına girer (sayfa tepsisi, 1600 px küçültme, fotoğraf seti).
 * 3. Bildirim izni: önce değeri anlatılır, sonra sistem izni. "Şimdi değil" ile geçilir.
 */

export const NATIVE_ONBOARDING_KEY = "cp.native.onboarding.v1";

type Intent = "photos" | "teacher" | null;
type Step = 0 | 1 | 2;

async function onboardingDone(): Promise<boolean> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return (await Preferences.get({ key: NATIVE_ONBOARDING_KEY })).value === "1";
  } catch {
    return true;
  }
}

async function markOnboardingDone(): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: NATIVE_ONBOARDING_KEY, value: "1" });
  } catch {
    /* kaydedilemezse bir sonraki açılışta yeniden sorulur */
  }
}

/** Öğrenci kabuğunda bir kez kurulur; yalnız uygulamada ve ilk açılışta açılır. */
export function NativeOnboardingGate({ suppressed = false }: { suppressed?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (suppressed || !isNativeApp()) return;
    let active = true;
    void onboardingDone().then((done) => {
      if (active && !done) setOpen(true);
    });
    return () => {
      active = false;
    };
  }, [suppressed]);
  if (!open) return null;
  return <NativeOnboarding onClose={() => setOpen(false)} />;
}

type Profile = { gradeLevel: string | null; learningGoal: string | null; firstName: string | null; voiceTutor: boolean };

export function NativeOnboarding({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groupId, setGroupId] = useState<LevelGroupId | null>(null);
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [intent, setIntent] = useState<Intent>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [permission, setPermission] = useState<PushPermission>("prompt");
  const [finishing, setFinishing] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/app/onboarding", { credentials: "same-origin" })
      .then((response) => (response.ok ? (response.json() as Promise<Profile>) : null))
      .then((data) => {
        if (!active || !data) return;
        setProfile(data);
        const preset = preselectLevel(data.gradeLevel, data.learningGoal);
        if (preset) {
          setGroupId(preset.groupId);
          setChoiceId(preset.choiceId);
        }
      })
      .catch(() => undefined);
    void pushPermissionState().then((state) => {
      if (active) setPermission(state);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const group = levelGroup(groupId);

  function pickGroup(id: LevelGroupId) {
    void triggerHaptic("selection");
    setGroupId(id);
    const next = levelGroup(id);
    setChoiceId(next && next.choices.length === 1 ? next.choices[0].id : null);
    setSaveError(false);
  }

  async function saveLevel() {
    if (!groupId || !choiceId) return;
    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch("/api/app/onboarding", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group: groupId, choice: choiceId }),
      });
      if (!response.ok) throw new Error(String(response.status));
      void triggerHaptic("light");
      setStep(1);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  function addPhotos(files: File[]) {
    const room = GUEST_HANDOFF_MAX_FILES - photos.length;
    if (room <= 0) {
      toast.message(`Burada en çok ${GUEST_HANDOFF_MAX_FILES} sayfa; kalanını kurulumda eklersin.`);
      return;
    }
    const { accepted, problems } = pickGuestFiles(files.slice(0, room));
    if (problems.length) toast.message(problems[0]);
    if (!accepted.length) return;
    setPhotos((current) => [...current, ...accepted]);
    setIntent("photos");
    void triggerHaptic("success");
  }

  async function shoot() {
    const result = await takeNativePhoto();
    if ("file" in result) addPhotos([result.file]);
    else if ("error" in result) {
      toast.error(result.error === "permission" ? CAMERA_PERMISSION_MESSAGE : CAMERA_UNAVAILABLE_MESSAGE);
    }
  }

  function chooseTeacher() {
    void triggerHaptic("selection");
    setIntent("teacher");
  }

  async function finish(allowPush: boolean) {
    setFinishing(true);
    if (allowPush) {
      const granted = await requestPushPermission();
      setPermission(granted ? "granted" : "denied");
    }
    await markOnboardingDone();
    void triggerHaptic("success");
    if (intent === "photos" && photos.length) {
      await holdGuestDocuments(photos);
      onClose();
      router.push(GUEST_DOCUMENT_NEXT);
      return;
    }
    onClose();
    if (intent === "teacher") router.push("/ogretmen");
  }

  const voice = profile?.voiceTutor === true;
  const greeting = profile?.firstName ? `Hoş geldin ${profile.firstName}!` : "Hoş geldin!";

  return (
    <div className="cx-nob" role="dialog" aria-modal="true" aria-labelledby="cx-nob-title" data-native-onboarding>
      <div className="cx-nob-sheet">
        <div className="cx-nob-progress" aria-label={`Adım ${step + 1} / 3`}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={index <= step ? "is-done" : undefined} />
          ))}
        </div>

        {step === 0 ? (
          <section className="cx-nob-step">
            <p className="cx-nob-eyebrow">{greeting}</p>
            <h2 id="cx-nob-title" ref={headingRef} tabIndex={-1} className="cx-nob-title">
              Hangi sınava hazırlanıyorsun?
            </h2>
            <p className="cx-nob-lead">Öğretmenin anlatımını ve soruların zorluğunu buna göre ayarlarız.</p>
            <div className="cx-nob-groups" role="radiogroup" aria-label="Seviye">
              {LEVEL_GROUPS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={groupId === item.id}
                  className={groupId === item.id ? "cx-nob-card is-selected" : "cx-nob-card"}
                  onClick={() => pickGroup(item.id)}
                >
                  <span className="cx-nob-card-title">{item.title}</span>
                  <span className="cx-nob-card-hint">{item.hint}</span>
                </button>
              ))}
            </div>
            {group && group.choices.length > 1 ? (
              <div className="cx-nob-chips" role="radiogroup" aria-label={`${group.title}: seçim`}>
                {group.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={choiceId === choice.id}
                    className={choiceId === choice.id ? "cx-nob-chip is-selected" : "cx-nob-chip"}
                    onClick={() => {
                      void triggerHaptic("selection");
                      setChoiceId(choice.id);
                      setSaveError(false);
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            ) : null}
            {saveError ? (
              <p className="cx-nob-error" role="alert">
                Seçimin kaydedilemedi. Bağlantını kontrol edip yeniden dene.
              </p>
            ) : null}
            <div className="cx-nob-actions">
              <button
                type="button"
                className="cx-nob-primary"
                disabled={!groupId || !choiceId || saving}
                onClick={() => void saveLevel()}
              >
                {saving ? "Kaydediliyor…" : "Devam et"}
              </button>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="cx-nob-step">
            <h2 id="cx-nob-title" ref={headingRef} tabIndex={-1} className="cx-nob-title">
              İlk adımı şimdi at
            </h2>
            <p className="cx-nob-lead">Notundan çalışma yolu kuralım ya da takıldığın soruyu hemen sor.</p>
            <div className="cx-nob-options">
              <div className={intent === "photos" ? "cx-nob-option is-selected" : "cx-nob-option"}>
                <button type="button" className="cx-nob-option-main" onClick={() => void shoot()}>
                  <Camera className="cx-nob-option-icon" aria-hidden />
                  <span className="cx-nob-option-text">
                    <span className="cx-nob-card-title">Notunun fotoğrafını çek</span>
                    <span className="cx-nob-card-hint">
                      {photos.length
                        ? `${photos.length} sayfa hazır · bir sayfa daha çekmek için dokun`
                        : "Defter sayfalarını çek; yolunu notundan kuralım."}
                    </span>
                  </span>
                  {photos.length ? <Check className="cx-nob-option-check" aria-hidden /> : null}
                </button>
                <button type="button" className="cx-nob-option-extra" onClick={() => galleryRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  Galeriden ekle
                </button>
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = event.target.files ? [...event.target.files] : [];
                    event.target.value = "";
                    if (files.length) addPhotos(files);
                  }}
                />
              </div>
              <button
                type="button"
                className={intent === "teacher" ? "cx-nob-option cx-nob-option-main is-selected" : "cx-nob-option cx-nob-option-main"}
                aria-pressed={intent === "teacher"}
                onClick={chooseTeacher}
              >
                {voice ? <Mic className="cx-nob-option-icon" aria-hidden /> : <MessageCircle className="cx-nob-option-icon" aria-hidden />}
                <span className="cx-nob-option-text">
                  <span className="cx-nob-card-title">{voice ? "Canlı sesli öğretmene sor" : "Öğretmenine sor"}</span>
                  <span className="cx-nob-card-hint">
                    {voice ? "Konuş'a dokun, sorunu sesle anlat." : "Takıldığın soruyu yaz ya da fotoğrafını gönder."}
                  </span>
                </span>
                {intent === "teacher" ? <Check className="cx-nob-option-check" aria-hidden /> : null}
              </button>
            </div>
            <div className="cx-nob-actions">
              <button
                type="button"
                className="cx-nob-primary"
                disabled={!intent}
                onClick={() => {
                  void triggerHaptic("light");
                  if (permission === "granted") void finish(false);
                  else setStep(2);
                }}
              >
                Devam et
              </button>
              <button
                type="button"
                className="cx-nob-secondary"
                onClick={() => {
                  setIntent(null);
                  if (permission === "granted") void finish(false);
                  else setStep(2);
                }}
              >
                Bu adımı geç
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="cx-nob-step">
            <BellRing className="cx-nob-hero-icon" aria-hidden />
            <h2 id="cx-nob-title" ref={headingRef} tabIndex={-1} className="cx-nob-title">
              Hatırlatmaları açalım mı?
            </h2>
            <ul className="cx-nob-list">
              <li>Sınavına kaç gün kaldığını haber veririz.</li>
              <li>Günü gelen tekrarlarını ve sıradaki dersini hatırlatırız.</li>
              <li>Gece 22:00 ile sabah 08:00 arası hatırlatma göndermeyiz.</li>
            </ul>
            {permission === "denied" ? (
              <p className="cx-nob-lead">
                Bildirimler bu telefonda kapalı. İstersen telefonunun Ayarlar &gt; Cortex Plus bölümünden açabilirsin.
              </p>
            ) : null}
            <div className="cx-nob-actions">
              {permission === "denied" ? (
                <button type="button" className="cx-nob-primary" disabled={finishing} onClick={() => void finish(false)}>
                  Başla
                </button>
              ) : (
                <>
                  <button type="button" className="cx-nob-primary" disabled={finishing} onClick={() => void finish(true)}>
                    Bildirimleri aç
                  </button>
                  <button type="button" className="cx-nob-secondary" disabled={finishing} onClick={() => void finish(false)}>
                    Şimdi değil
                  </button>
                </>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
