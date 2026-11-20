/*
  Misafir demosunun branş podcast kesitleri (Faz 7, 20 Kasım 2026). Her kesit ürünün kendi podcast döngüsüyle
  (`teacherPodcastLoop`) o branşın tur dersinden yazılır ve ürünün sesleriyle bir kez seslendirilir; dosya
  `public/ornek/` altında durur, demo ve misafir radyo önizlemesi 0 maliyetle çalar (çalışma anında model, ses ya da
  kredi yok). Süreler dosyanın ölçülen süreleridir. Bir branşın kesiti yoksa o branşta podcast önizlemesi gösterilmez.
*/

export type GuestTrackId = "lise" | "muhendislik" | "tus" | "hukuk";

export type DemoPodcastLine = {
  speaker: "ada" | "kerem";
  name: string;
  text: string;
  startMs: number;
  endMs: number;
};

export type DemoPodcast = {
  src: string;
  /** Kesitin yazıldığı örnek notun adı (ekranda "… ders notundan" diye geçer). */
  source: string;
  /** Radyo önizlemesinde ünite adı. */
  unit: string;
  durationMs: number;
  lines: readonly DemoPodcastLine[];
};

export const DEMO_PODCASTS: Partial<Record<GuestTrackId, DemoPodcast>> = {
  lise: {
    src: "/ornek/podcast-koklu-sayilar.mp3",
    source: "Köklü Sayılar ders notu",
    unit: "Köklü Sayılar",
    durationMs: 15672,
    lines: [
      {
        speaker: "ada",
        name: "Ada",
        text: "√(x²) ifadesinde x negatifse sonuç x mi olur, −x mi?",
        startMs: 0,
        endMs: 7008,
      },
      {
        speaker: "kerem",
        name: "Kerem",
        text: "−x olur, çünkü x negatifken |x| = −x'tir ve karekökün sonucu negatif olamaz.",
        startMs: 7008,
        endMs: 15672,
      },
    ],
  },
  muhendislik: {
    src: "/ornek/podcast-muhendislik.mp3",
    source: "Akışkanlar ve Termodinamik vize notu",
    unit: "Kaldırma Kuvveti",
    durationMs: 16824,
    lines: [
      {
        speaker: "ada",
        name: "Ada",
        text: "Bir cisim aynı hacimde tamamen batırıldığında, kaldırma kuvvetini bulmak için cismin mi sıvının mı yoğunluğunu kullanırsın?",
        startMs: 0,
        endMs: 8712,
      },
      {
        speaker: "kerem",
        name: "Kerem",
        text: "Sıvının yoğunluğunu kullanırım, çünkü kaldırma kuvveti, cismin yerini değiştirdiği sıvının ağırlığıdır.",
        startMs: 8712,
        endMs: 16824,
      },
    ],
  },
  tus: {
    src: "/ornek/podcast-tus.mp3",
    source: "Kardiyoloji Antiaritmikler TUS notu",
    unit: "Antiaritmik İlaçlar",
    durationMs: 15360,
    lines: [
      {
        speaker: "kerem",
        name: "Kerem",
        text: "Hipokalemi neden riski daha da artırıyor?",
        startMs: 0,
        endMs: 4152,
      },
      {
        speaker: "ada",
        name: "Ada",
        text: "Potasyumun düşmesi repolarizasyonu daha da geciktirebilir, Sınıf III etkisiyle uzamış QT’nin üzerine bu gecikme eklenince torsades de pointes riski artar.",
        startMs: 4152,
        endMs: 15360,
      },
    ],
  },
  hukuk: {
    src: "/ornek/podcast-hukuk.mp3",
    source: "Anayasa Yasama Süreci notu",
    unit: "TBMM Yeter Sayıları",
    durationMs: 17160,
    lines: [
      {
        speaker: "kerem",
        name: "Kerem",
        text: "Üye tamsayısının salt çoğunluğu 301 oluyor, geri gönderilen kanunda neden katılanların çoğunluğuna bakmıyoruz?",
        startMs: 0,
        endMs: 8808,
      },
      {
        speaker: "ada",
        name: "Ada",
        text: "Çünkü geri gönderilen kanunun aynen kabulünde aranan ölçü, oturuma katılanların değil üye tamsayısının salt çoğunluğudur.",
        startMs: 8808,
        endMs: 17160,
      },
    ],
  },
};

/** Radyo önizlemesinin çalma listesi: kesiti olan branşlar, sabit sırayla. */
export const DEMO_RADIO_ORDER: readonly GuestTrackId[] = ["lise", "muhendislik", "tus", "hukuk"];

export function demoRadioPlaylist(): DemoPodcast[] {
  return DEMO_RADIO_ORDER.map((id) => DEMO_PODCASTS[id]).filter((item): item is DemoPodcast => Boolean(item));
}
