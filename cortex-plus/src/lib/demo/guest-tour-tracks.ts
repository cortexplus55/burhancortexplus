import type { GuestTrackId } from "@/lib/demo/demo-podcasts";
import type { GuestTourContent, TourPrep } from "@/lib/demo/guest-tour-types";
import type { LessonV3 } from "@/lib/learning/lesson-v3";
import {
  TOUR_CARDS,
  TOUR_LESSON,
  TOUR_PREP,
  TOUR_QUIZ,
  TOUR_SKETCH,
  TOUR_TRUE_FALSE,
  WARNING_FORMULA,
  tourTwoOptionHint,
} from "@/lib/demo/guest-tour";
import { HUKUK_TOUR } from "@/lib/demo/guest-tracks/hukuk";
import { MUHENDISLIK_TOUR } from "@/lib/demo/guest-tracks/muhendislik";
import { TUS_TOUR } from "@/lib/demo/guest-tracks/tus";

/**
 * Misafir demosunun dört branşı tek yerde (Faz 7, 20 Kasım 2026). Ana sayfada seçilen branşa göre turun 3-7.
 * adımları (ders, konu testi, kartlar, doğru/yanlış, Plus önizlemeleri) bu kayıttan beslenir. Dosya ana sayfanın
 * ilk yükünde yoktur: yalnız ayrı parça olarak yüklenen ürün ekranları ve önizlemeler içe aktarır. İlk yükte gereken
 * hafif bilgi (dosya adı, sayfa sayısı, yol, uyarı) `lib/marketing/guest-demo-tracks.ts`te.
 */

const LISE_TOUR: GuestTourContent = {
  prep: TOUR_PREP,
  lesson: TOUR_LESSON,
  quiz: TOUR_QUIZ,
  twoOptionHint: tourTwoOptionHint,
  cards: TOUR_CARDS,
  trueFalse: TOUR_TRUE_FALSE,
  sketch: { kind: "board", ...TOUR_SKETCH },
  warningPattern: WARNING_FORMULA,
};

export const GUEST_TOUR_CONTENT: Record<GuestTrackId, GuestTourContent> = {
  lise: LISE_TOUR,
  muhendislik: MUHENDISLIK_TOUR,
  tus: TUS_TOUR,
  hukuk: HUKUK_TOUR,
};

/** Seçili branşın içeriği; bilinmeyen kimlikte lise (turun öteden beri oynanan örneği). */
export function guestTourContent(track: GuestTrackId | null | undefined): GuestTourContent {
  return (track && GUEST_TOUR_CONTENT[track]) || LISE_TOUR;
}

/** Her branşın dersi: podcast kesitleri ürünün podcast motoruyla bu derslerden yazılır. */
export const GUEST_TOUR_LESSONS: Record<GuestTrackId, LessonV3> = {
  lise: LISE_TOUR.lesson,
  muhendislik: MUHENDISLIK_TOUR.lesson,
  tus: TUS_TOUR.lesson,
  hukuk: HUKUK_TOUR.lesson,
};

/** Her branşın hazırlık bilgisi ({ topic, title }): sınav sabahı kâğıdının başlığı ve podcast üretiminin konusu. */
export const GUEST_TOUR_PREPS: Record<GuestTrackId, TourPrep> = {
  lise: LISE_TOUR.prep,
  muhendislik: MUHENDISLIK_TOUR.prep,
  tus: TUS_TOUR.prep,
  hukuk: HUKUK_TOUR.prep,
};

/** Hoca uyarısının izini taşıyan ürün adımları, branşın örnek verisinden (dört adımın verisi uyarının kalıbını taşır). */
export function guestTourWarningSteps(track: GuestTrackId): ("lesson" | "question" | "cards" | "check")[] {
  const content = guestTourContent(track);
  const fixtures = { lesson: content.lesson, question: content.quiz, cards: content.cards, check: content.trueFalse } as const;
  return (Object.keys(fixtures) as (keyof typeof fixtures)[]).filter((step) => content.warningPattern.test(JSON.stringify(fixtures[step])));
}
