import { readLearningPrefs } from "@/lib/client/learning-prefs-store";
import type { TutorVoice } from "@/lib/student/learning-prefs";

type StudioSpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

const MALE_HINT = /tolga|kerem|ahmet|cem|erkek|\bmale\b|\bman\b/i;
const FEMALE_HINT = /seda|emel|yelda|filiz|zeynep|elif|kad[ıi]n|female|woman|google t[üu]rk/i;

/**
 * Türkçe seslerden öğrencinin seçtiği cinsiyete uyanı (Ayarlar > Öğretmen
 * sesi, 1 Ekim 2026). Cihaz ses adından anlaşılıyor; uyan yoksa ilk Türkçe ses.
 */
export function pickVoiceFor(
  voices: Pick<SpeechSynthesisVoice, "lang" | "name">[],
  gender: TutorVoice,
): number {
  const turkish = voices
    .map((voice, index) => ({ voice, index }))
    .filter(({ voice }) => voice.lang.toLowerCase().startsWith("tr") || voice.lang.toLowerCase().includes("tr"));
  if (!turkish.length) return -1;
  const hint = gender === "male" ? MALE_HINT : FEMALE_HINT;
  return (turkish.find(({ voice }) => hint.test(voice.name)) ?? turkish[0]).index;
}

export function pickTurkishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const index = pickVoiceFor(voices, readLearningPrefs().voice);
  return index >= 0 ? voices[index] : null;
}

/**
 * Tarayıcının ses listesi ilk çağrıda boş gelebiliyor.
 *
 * Chrome sesleri sonradan yüklüyor ve `voiceschanged` olayıyla haber veriyor.
 * Beklemezsek Türkçe ses bulunamıyor ve konuşma "dil yok" diye düşüyor.
 * Bazı tarayıcılarda o olay hiç gelmediği için bir üst sınır koyuyoruz.
 */
async function voicesReady(): Promise<void> {
  if (window.speechSynthesis.getVoices().length > 0) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, 1200);
  });
}

/**
 * Metni Türkçe seslendirir.
 *
 * `onEnd` yalnızca konuşma **gerçekten bittiğinde**, `onError` ise
 * seslendirme yapılamadığında çalışıyor. İkisini ayırmak zorundayız:
 * eskiden hata da "bitti" sayılıyordu ve bunun bedeli podcast stüdyosunda
 * ağırdı — öğrenci Oynat'a bastığında beş bölüm arka arkaya "bitti" diye
 * zincirleniyor, ekran hiç ses çıkmadan "Yayın bitti." yazısına atlıyordu.
 * Arıza, başarı gibi görünüyordu.
 */
export function speakTurkish(
  text: string,
  handlers?: {
    onEnd?: () => void;
    onError?: (reason: string) => void;
    /** Ses listesi gecikirse bitmiş sınav yeniden konuşmasın. */
    cancelled?: () => boolean;
  },
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    handlers?.onError?.("unsupported");
    return;
  }

  const clean = text.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!clean) {
    if (!handlers?.cancelled?.()) handlers?.onEnd?.();
    return;
  }

  void voicesReady().then(() => {
    if (handlers?.cancelled?.()) return;
    window.speechSynthesis.cancel();
    if (handlers?.cancelled?.()) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "tr-TR";
    const voice = pickTurkishVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.onend = () => {
      if (handlers?.cancelled?.()) return;
      handlers?.onEnd?.();
    };
    utterance.onerror = (event) => {
      // Kullanıcı durdurduğunda ya da araya yeni bir metin girdiğinde de bu
      // olay geliyor; bu bir arıza değil, kimseye bildirmiyoruz.
      if (event.error === "interrupted" || event.error === "canceled") return;
      if (handlers?.cancelled?.()) return;
      handlers?.onError?.(event.error || "failed");
    };
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeech() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

export function createRecognizer(): StudioSpeechRec | null {
  if (typeof window === "undefined") return null;
  const win = window as Window & {
    SpeechRecognition?: new () => StudioSpeechRec;
    webkitSpeechRecognition?: new () => StudioSpeechRec;
  };
  const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "tr-TR";
  rec.interimResults = true;
  rec.continuous = false;
  return rec;
}
