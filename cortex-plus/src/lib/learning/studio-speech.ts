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

export function speakTurkish(
  text: string,
  onEnd?: () => void,
): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return null;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    text.replace(/\s+/g, " ").trim().slice(0, 4000),
  );
  utterance.lang = "tr-TR";
  const voice = pickTurkishVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  utterance.onend = () => onEnd?.();
  utterance.onerror = (event) => {
    if (event.error === "interrupted" || event.error === "canceled") return;
    onEnd?.();
  };
  window.speechSynthesis.speak(utterance);
  return utterance;
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
