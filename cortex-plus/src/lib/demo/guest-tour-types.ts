import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import type { LessonV3 } from "@/lib/learning/lesson-v3";
import type { SketchScene } from "@/lib/learning/video-lesson";
import type { AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import type { ReelBeat } from "@/lib/learning/visual-scenes/schema";

/**
 * Misafir demosunun bir branşının bütün içeriği (Faz 7, 20 Kasım 2026). Her alan ürünün kendi veri biçimindedir:
 * ders `LessonV3`, konu testi sorusu `PublicQuizQuestion`, kart ön/arka yüz, doğru/yanlış önermesi (`correctedStatement`
 * yanlış önermede), çizimli video sahnesi. Turda ürünün kendi bileşenleri çizer; bu dosyalar yalnız veri taşır.
 */

export type TourPrep = { title: string; topic: string };

export type TourCard = { front: string; back: string };

export type TourTrueFalse = { text: string; correct: boolean; explanation: string; correctedStatement?: string };

/** Ürünün eski çizim tahtası: parametrik diyagram kartı (lise branşı). */
export type TourBoardSketch = {
  kind: "board";
  title: string;
  sceneMs: number;
  scenes: (SketchScene & { diagram: NonNullable<SketchScene["diagram"]> })[];
};

/**
 * Branşa özel SVG sahnesi: ürünün 5 sahneli çizimli video akışındaki görsel verisi, ham hâliyle. Önizleme onu ürünün
 * kendi ayrıştırıcısından (`parseReelVisual`) geçirip ürünün sahne bileşeniyle çizer; bekçi test her sahnenin
 * ayrıştığını ve doğru arketipte olduğunu tutar.
 */
export type TourReelScene = {
  sceneTitle: string;
  narration: string;
  keyFact?: string;
  voice: "ada" | "kerem";
  beat: ReelBeat;
  visual: Record<string, unknown>;
};

export type TourReelSketch = {
  kind: "reel";
  title: string;
  sceneMs: number;
  domain: AcademicDomain;
  scenes: TourReelScene[];
};

export type TourSketch = TourBoardSketch | TourReelSketch;

export type GuestTourContent = {
  prep: TourPrep;
  lesson: LessonV3;
  quiz: PublicQuizQuestion[];
  /**
   * "İki şık arasında kaldım": seçilen iki şıkkın arasındaki kavramsal farkı hatırlatır. Hangi iki şık seçilirse
   * seçilsin doğru şıkkı ve hesabı söylemez (rakam yazmaz).
   */
  twoOptionHint: (pair: readonly string[]) => string;
  cards: TourCard[];
  trueFalse: TourTrueFalse[];
  sketch: TourSketch;
  /** Örnek notun uyarısının izi: dört ürün adımının verisi bu kalıbı taşır (üst çubuktaki uyarı etiketi o adımda parlar). */
  warningPattern: RegExp;
};
