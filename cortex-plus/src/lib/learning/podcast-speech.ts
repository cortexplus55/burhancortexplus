import { speakVerified } from "@/lib/learning/speech-normalizer";

/**
 * Bir podcast satırının sese giden okunuşu: kayıttaki `spoken`, yoksa ekrandaki metnin doğrulanmış okunuşu. Ses
 * önbelleğinin anahtarı (`audioHash`) bu metinden kurulur; ses ucu (`/api/learning/podcast/audio`) ve Sınav Radyosu
 * (Faz 7) aynı işlevi kullanır — ikisi ayrışırsa radyo üretilmiş sesi "önbellekte yok" sanardı.
 */
export function podcastLineSpeech(line: { text: string; spoken?: string }): string {
  return line.spoken?.trim() || speakVerified(line.text);
}
