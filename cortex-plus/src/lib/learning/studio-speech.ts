type StudioSpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export function pickTurkishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("tr")) ??
    voices.find((v) => v.lang.toLowerCase().includes("tr")) ??
    null
  );
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
  handlers?: { onEnd?: () => void; onError?: (reason: string) => void },
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    handlers?.onError?.("unsupported");
    return;
  }

  const clean = text.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!clean) {
    handlers?.onEnd?.();
    return;
  }

  void voicesReady().then(() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "tr-TR";
    const voice = pickTurkishVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.onend = () => handlers?.onEnd?.();
    utterance.onerror = (event) => {
      // Kullanıcı durdurduğunda ya da araya yeni bir metin girdiğinde de bu
      // olay geliyor; bu bir arıza değil, kimseye bildirmiyoruz.
      if (event.error === "interrupted" || event.error === "canceled") return;
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
