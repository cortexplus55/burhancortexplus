/**
 * Misafir demosunun branşları (Faz 7, 20 Kasım 2026).
 *
 * Ana sayfanın 7 adımlı turu artık tek bir matematik notuyla değil, seçilen branşın örnek notuyla oynanır: dosya adı,
 * sayfa sayısı, tarama bulguları, yol haritası, hoca uyarısı, ders, konu testi, kartlar, doğru/yanlış ve Plus
 * önizlemeleri branşa göre değişir. Bu dosya ilk yükte gereken HAFİF bilgiyi tutar (1. ve 2. adım, uyarı etiketi,
 * kahramanın seçicisi ve profil eşlemesi). Ders, soru, kart ve sahnelerin kendisi ürünün veri biçiminde
 * `lib/demo/guest-tour-tracks.ts`te, ayrı parça olarak yüklenen ürün ekranlarında.
 *
 * Faz 9 (20 Kasım 2026, ürün sahibi: "iki ayrı seçici kafa karıştırıyor"): kahramanın sekmeleri ve turun branş şeridi
 * TEK seçicide birleşti (`HERO_PICKS`). Dört seçenek dört branştır: "Lise & YKS" (matematik), "Üniversite"
 * (mühendislik), "TUS / Tıp" (farmakoloji), "KPSS / Hukuk" (anayasa). Seçenek kahramanın profilini de belirler
 * (`trackForSegment`, `segmentForTrack`): lise ve YKS/LGS profilleri aynı seçeneğe düşer, eski bağlantının profili
 * kayıt bağlantısı için korunur.
 *
 * Pazarlama kuralı (19 Ekim 2026) burada da geçerli: her cümle bugün üründe çalışan bir şeyi anlatır.
 */

import { DEMO_PODCASTS, type GuestTrackId } from "@/lib/demo/demo-podcasts";
import { SAME_NOTE_CASE } from "@/lib/marketing/advantage-content";
import type { AudienceSegmentId } from "@/lib/marketing/landing-showcase";

export type { GuestTrackId };

export const GUEST_TRACK_IDS = ["lise", "muhendislik", "tus", "hukuk"] as const satisfies readonly GuestTrackId[];

export type GuestDemoRoadmapDay = { day: string; title: string; ready: boolean; meta: string };

export type GuestDemoTrack = {
  id: GuestTrackId;
  /** Kahramanın seçicisindeki ad ("Lise & YKS"). */
  pickLabel: string;
  /** Seçeneğin alt satırı: örnek notun alanı ("Matematik"). */
  field: string;
  /** Örnek notun kartındaki ders adı ("Örnek not · {subject} · N sayfa"). */
  subject: string;
  /** Örnek notun dosya adı. */
  file: string;
  pages: number;
  /** Örnek notun uyarı satırı: "{etiket}: “…”" (etiket üst çubukta kalır, satırın tamamı tarama bulgusu). */
  warning: string;
  /** Tarama anının son bulgusu: notta şekil ya da tablo nerede. */
  figure: string;
  /** Yolun konuları (tarama bulgusundaki "N konu" bu sayıdır). */
  units: readonly string[];
  /** Yol haritası: konular gün gün; ilk gün hazır ders. */
  days: readonly GuestDemoRoadmapDay[];
  /**
   * Stüdyonun göstereceği örnek verinin sayıları (Faz 9.1): ana sayfada çekirdekten doğan kartlar ("Ders · 2 bölüm",
   * "Konu testi · 1 soru", "Kartlar · 2 kart") bunları söyler. Veri ilk yükte değil (`guest-tour-tracks.ts`, ayrı
   * parça); bekçi test burada yazan sayıların o veriyle aynı olduğunu tutar.
   */
  tour: { sections: number; questions: number; cards: number; statements: number };
};

/** Dört branşın örnek dersi bugün aynı biçimde: 2 bölüm, 1 konu testi sorusu, 2 kart, 2 önerme (bekçi testle). */
const TOUR_COUNTS = { sections: 2, questions: 1, cards: 2, statements: 2 } as const;

const READY = "Hazır · 5 dk";

/** Konulardan yol haritası: her konu bir gün, sonda konu testleri ve tekrar; yedi günlük plan. */
function unitDays(units: readonly string[], closing: string): GuestDemoRoadmapDay[] {
  return [
    ...units.map((title, at) => ({ day: `${at + 1}. gün`, title, ready: at === 0, meta: at === 0 ? READY : "" })),
    { day: `${units.length + 1}–7. gün`, title: closing, ready: false, meta: "" },
  ];
}

const LISE_DAYS: GuestDemoRoadmapDay[] = [
  { day: "1. gün", title: "Köklü ifadelerin tanımı ve çift derece kuralı", ready: true, meta: READY },
  { day: "2. gün", title: "Sayıyı kök dışına çıkarma ve kök içine alma", ready: false, meta: "" },
  { day: "3. gün", title: "Köklü sayılarda toplama, çıkarma ve çarpma", ready: false, meta: "" },
  { day: "4. gün", title: "Eşlenik ve paydayı rasyonel yapma", ready: false, meta: "" },
  { day: "5–7. gün", title: "İç içe kökler, konu testi ve genel tekrar", ready: false, meta: "" },
];

const MUHENDISLIK_UNITS = ["Kaldırma Kuvveti Vektörleri", "Bernoulli Denklemi", "Süreklilik & Basınç Kayıpları"] as const;
const TUS_UNITS = [
  "Vaughan-Williams Sınıflandırması",
  "Sınıf I Na⁺ Kanal Blokajı",
  "Sınıf III K⁺ Blokajı & Torsades de Pointes",
  "Klinik Tuzak Spotları",
] as const;
const HUKUK_UNITS = ["TBMM Toplantı/Karar Yeter Sayıları", "Nitelikli Çoğunluklar (3/5 vs 2/3)", "Cumhurbaşkanı Veto & AYM Denetimi"] as const;

export const GUEST_DEMO_TRACKS: Record<GuestTrackId, GuestDemoTrack> = {
  lise: {
    id: "lise",
    pickLabel: "Lise & YKS",
    field: "Matematik",
    subject: "Matematik",
    file: SAME_NOTE_CASE.input.file,
    pages: 6,
    warning: SAME_NOTE_CASE.input.lines[0],
    figure: SAME_NOTE_CASE.input.lines[1],
    units: LISE_DAYS.map((day) => day.title),
    days: LISE_DAYS,
    tour: TOUR_COUNTS,
  },
  muhendislik: {
    id: "muhendislik",
    pickLabel: "Üniversite",
    field: "Mühendislik",
    subject: "Akışkanlar Mekaniği",
    file: "Akiskanlar_ve_Termodinamik_Vize_Notu.pdf",
    pages: 14,
    warning: "Hoca uyarısı: “Kaldırma kuvvetinde cismin değil sıvının yoğunluğu (d_sıvı) alınır; SI birimi (N / Pa) yazılmazsa −5 puan kırılır!”",
    figure: "5. sayfada kuvvet diyagramı ve tablo",
    units: MUHENDISLIK_UNITS,
    days: unitDays(MUHENDISLIK_UNITS, "Konu testleri, vize provası ve genel tekrar"),
    tour: TOUR_COUNTS,
  },
  tus: {
    id: "tus",
    pickLabel: "TUS / Tıp",
    field: "Farmakoloji",
    subject: "Farmakoloji",
    file: "Kardiyoloji_Antiaritmikler_TUS_Notu.pdf",
    pages: 18,
    warning: "TUS spotu: “Amiodaron Sınıf III olmasına rağmen tüm sınıfların özelliğini taşır; tiroid ve akciğer toksisitesi mutlaka sorulur.”",
    figure: "4. sayfada Vaughan-Williams tablosu",
    units: TUS_UNITS,
    days: unitDays(TUS_UNITS, "Konu testleri, vaka soruları ve genel tekrar"),
    tour: TOUR_COUNTS,
  },
  hukuk: {
    id: "hukuk",
    pickLabel: "KPSS / Hukuk",
    field: "Anayasa",
    subject: "Anayasa Hukuku",
    file: "Anayasa_Yasama_Sureci_Notu.pdf",
    pages: 12,
    warning: "Sınav tuzağı: “Geri gönderilen kanunu TBMM üye tamsayısının salt çoğunluğu (301) ile aynen kabul edebilir.”",
    figure: "6. sayfada yeter sayı tablosu",
    units: HUKUK_UNITS,
    days: unitDays(HUKUK_UNITS, "Konu testleri ve genel tekrar"),
    tour: TOUR_COUNTS,
  },
};

export const DEFAULT_GUEST_TRACK: GuestTrackId = "lise";

export function isGuestTrackId(value: unknown): value is GuestTrackId {
  return typeof value === "string" && (GUEST_TRACK_IDS as readonly string[]).includes(value);
}

export function guestDemoTrack(id: GuestTrackId | null | undefined): GuestDemoTrack {
  return (id && GUEST_DEMO_TRACKS[id]) || GUEST_DEMO_TRACKS[DEFAULT_GUEST_TRACK];
}

/** Uyarının etiketi ("Hoca uyarısı", "TUS spotu", "Sınav tuzağı"): satırın iki noktaya kadarki kısmı. */
export function trackWarningLabel(track: GuestTrackId): string {
  return guestDemoTrack(track).warning.split(":")[0]!.trim();
}

/** Profil → branş: lise ve YKS/LGS lise, üniversite mühendislik, akademik (KPSS) hukuk, TUS TUS. */
const SEGMENT_TRACK: Record<AudienceSegmentId, GuestTrackId> = {
  lise: "lise",
  "yks-lgs": "lise",
  universite: "muhendislik",
  akademik: "hukuk",
  tus: "tus",
};

export function trackForSegment(segment: AudienceSegmentId): GuestTrackId {
  return SEGMENT_TRACK[segment];
}

/** Kahramanın tek seçicisi: dört seçenek sırayla, her biri bir branş ve o branşın varsayılan profili. */
export const HERO_PICKS: readonly { track: GuestTrackId; segment: AudienceSegmentId }[] = [
  { track: "lise", segment: "lise" },
  { track: "muhendislik", segment: "universite" },
  { track: "tus", segment: "tus" },
  { track: "hukuk", segment: "akademik" },
];

/** Seçicinin ekran okuyucu adı. */
export const HERO_PICK_ARIA = "Hangi sınava hazırlanıyorsun?";

/** Seçeneğin tam adı ("Lise & YKS · Matematik"): ekran okuyucu bu adı okur. */
export function heroPickName(track: GuestTrackId): string {
  const item = guestDemoTrack(track);
  return `${item.pickLabel} · ${item.field}`;
}

/**
 * Branş seçilince profil: o anki profil zaten bu branşınsa yerinde kalır (eski `?hedef=yks-lgs` bağlantısının kayıttaki
 * YKS ön seçimi korunur); değilse seçeneğin varsayılan profili.
 */
export function segmentForTrack(track: GuestTrackId, current: AudienceSegmentId): AudienceSegmentId {
  if (trackForSegment(current) === track) return current;
  return HERO_PICKS.find((pick) => pick.track === track)?.segment ?? "lise";
}

/** Branşın Plus adımında podcast kesiti var mı (`DEMO_PODCASTS`); yoksa o branşta podcast önizlemesi gösterilmez. */
export function trackHasPodcast(track: GuestTrackId): boolean {
  return Boolean(DEMO_PODCASTS[track]);
}
