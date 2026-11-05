/*
  Oynatıcıda çizilecek sesler (5 Kasım 2026; 4 Kasım'da kapanan #559'un B15 maddesi).
  Tek sesli özet (1 dk) yalnız bir konuşmacı taşır; konuşmayan sesin görseli çizilmez. İki sesli türlerde ikisi de
  çizilir. Zaman çizelgesi henüz boşsa (ses yüklenirken) ikisi de kalır — ekran titremesin.
*/

export type PodcastSpeakerId = "ada" | "kerem";

export const PODCAST_SPEAKERS: readonly PodcastSpeakerId[] = ["ada", "kerem"];

/** Modelin ses yerine yazabildiği rol adları (metin öneki olarak da düşer). Kişi adı listesi değildir. */
export const SPEAKER_ROLE_WORDS: readonly string[] = ["öğretmen", "ogretmen", "öğrenci", "ogrenci", "sunucu"];

export function visibleSpeakers(lines: readonly { speaker: string }[]): PodcastSpeakerId[] {
  const present = PODCAST_SPEAKERS.filter((speaker) => lines.some((line) => line.speaker === speaker));
  return present.length ? present : [...PODCAST_SPEAKERS];
}
