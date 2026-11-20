/**
 * Misafir demosunun branşları (Faz 7, 20 Kasım 2026).
 *
 * Ana sayfanın 7 adımlı turu artık tek bir matematik notuyla değil, seçilen branşın örnek notuyla oynanır: dosya adı,
 * sayfa sayısı, tarama bulguları, yol haritası, hoca uyarısı, ders, konu testi, kartlar, doğru/yanlış ve Plus
 * önizlemeleri branşa göre değişir. Bu dosya ilk yükte gereken HAFİF bilgiyi tutar (1. ve 2. adım, uyarı etiketi,
 * bağlam satırı, kahraman sekmesiyle eşleme). Ders, soru, kart ve sahnelerin kendisi ürünün veri biçiminde
 * `lib/demo/guest-tour-tracks.ts`te, ayrı parça olarak yüklenen ürün ekranlarında.
 *
 * Kahraman sekmesi ve branş tek durum: lise ve YKS/LGS sekmeleri lise branşını, üniversite sekmesi mühendisliği,
 * akademik sekme (KPSS · TUS · DUS · ALES) hukuku açar. Branş şeridinden seçilen branş da sekmeyi eşler: TUS ve hukuk
 * akademik sekmede, mühendislik üniversitede, lise o an lise ya da YKS/LGS sekmesindeyse yerinde kalır.
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
  /** Branş şeridindeki ad. */
  label: string;
  /** Örnek notun kartındaki ders adı ("Örnek not · {subject} · N sayfa"). */
  subject: string;
  /** Örnek notun dosya adı. */
  file: string;
  pages: number;
  /** Konsolun bağlam satırı: örnek notun bu branş için ne anlama geldiği (en çok 90 karakter). */
  context: string;
  /** Örnek notun uyarı satırı: "{etiket}: “…”" (etiket üst çubukta kalır, satırın tamamı tarama bulgusu). */
  warning: string;
  /** Tarama anının son bulgusu: notta şekil ya da tablo nerede. */
  figure: string;
  /** Yolun konuları (tarama bulgusundaki "N konu" bu sayıdır). */
  units: readonly string[];
  /** Yol haritası: konular gün gün; ilk gün hazır ders. */
  days: readonly GuestDemoRoadmapDay[];
};

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
    label: "Lise & YKS · Matematik",
    subject: "Matematik",
    file: SAME_NOTE_CASE.input.file,
    pages: 6,
    context: "Örnek not matematik; yazılı, TYT, AYT ve LGS notlarında da aynı yedi adım kurulur.",
    warning: SAME_NOTE_CASE.input.lines[0],
    figure: SAME_NOTE_CASE.input.lines[1],
    units: LISE_DAYS.map((day) => day.title),
    days: LISE_DAYS,
  },
  muhendislik: {
    id: "muhendislik",
    label: "Üniversite · Mühendislik",
    subject: "Akışkanlar Mekaniği",
    file: "Akiskanlar_ve_Termodinamik_Vize_Notu.pdf",
    pages: 14,
    context: "Örnek not mühendislik vizesi; hocanın slaytı ya da PDF'i için de adımlar aynı.",
    warning: "Hoca uyarısı: “Kaldırma kuvvetinde cismin değil sıvının yoğunluğu (d_sıvı) alınır; SI birimi (N / Pa) yazılmazsa −5 puan kırılır!”",
    figure: "5. sayfada kuvvet diyagramı ve tablo",
    units: MUHENDISLIK_UNITS,
    days: unitDays(MUHENDISLIK_UNITS, "Konu testleri, vize provası ve genel tekrar"),
  },
  tus: {
    id: "tus",
    label: "TUS / Tıp · Farmakoloji",
    subject: "Farmakoloji",
    file: "Kardiyoloji_Antiaritmikler_TUS_Notu.pdf",
    pages: 18,
    context: "Örnek not TUS farmakolojisi; DUS ve tıp fakültesi notlarında da adımlar aynı.",
    warning: "TUS spotu: “Amiodaron Sınıf III olmasına rağmen tüm sınıfların özelliğini taşır; tiroid ve akciğer toksisitesi mutlaka sorulur.”",
    figure: "4. sayfada Vaughan-Williams tablosu",
    units: TUS_UNITS,
    days: unitDays(TUS_UNITS, "Konu testleri, vaka soruları ve genel tekrar"),
  },
  hukuk: {
    id: "hukuk",
    label: "KPSS / Hukuk · Anayasa",
    subject: "Anayasa Hukuku",
    file: "Anayasa_Yasama_Sureci_Notu.pdf",
    pages: 12,
    context: "Örnek not KPSS anayasa hukuku; hukuk fakültesi vizesinde de aynı yedi adım kurulur.",
    warning: "Sınav tuzağı: “Geri gönderilen kanunu TBMM üye tamsayısının salt çoğunluğu (301) ile aynen kabul edebilir.”",
    figure: "6. sayfada yeter sayı tablosu",
    units: HUKUK_UNITS,
    days: unitDays(HUKUK_UNITS, "Konu testleri ve genel tekrar"),
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

/** Kahraman sekmesi → branş: lise ve YKS/LGS lise, üniversite mühendislik, akademik hukuk. */
const SEGMENT_TRACK: Record<AudienceSegmentId, GuestTrackId> = {
  lise: "lise",
  "yks-lgs": "lise",
  universite: "muhendislik",
  akademik: "hukuk",
};

export function trackForSegment(segment: AudienceSegmentId): GuestTrackId {
  return SEGMENT_TRACK[segment];
}

/**
 * Branş → kahraman sekmesi. Lise branşı o an lise ya da YKS/LGS sekmesindeyse sekme yerinde kalır; TUS akademik
 * sekmenin kapsamındadır (KPSS · TUS · DUS · ALES).
 */
export function segmentForTrack(track: GuestTrackId, current: AudienceSegmentId): AudienceSegmentId {
  if (trackForSegment(current) === track) return current;
  if (track === "lise") return "lise";
  if (track === "muhendislik") return "universite";
  return "akademik";
}

/** Branşın Plus adımında podcast kesiti var mı (`DEMO_PODCASTS`); yoksa o branşta podcast önizlemesi gösterilmez. */
export function trackHasPodcast(track: GuestTrackId): boolean {
  return Boolean(DEMO_PODCASTS[track]);
}
