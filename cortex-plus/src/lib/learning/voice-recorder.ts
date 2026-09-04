/**
 * Sözlü sınav için mikrofon kaydı.
 *
 * Sunucu tarafı çözümlemeye geçtik: tarayıcının kendi tanıma API'si pratikte
 * yalnız Chrome'da çalışıyordu ve Safari/telefon kullanan öğrenci sözlü
 * sınavı hiç yapamıyordu. MediaRecorder her yerde var.
 *
 * Kayıt sessizlikle kendiliğinden bitiyor; öğrenci "bitirdim" düğmesine
 * basmak zorunda kalmasın diye — akış eskisi gibi eller serbest kalıyor.
 */

export type Recorder = {
  /** Kaydı bitirir ve sesi döndürür; hiç ses yakalanmadıysa null. */
  stop: () => Promise<Blob | null>;
  cancel: () => void;
};

export type RecorderOptions = {
  /** Bu kadar sürekli sessizlikten sonra kayıt kendiliğinden biter. */
  silenceMs?: number;
  /** Sessizlik sayılan eşik (0-1 arası RMS). */
  threshold?: number;
  /** Sessizlik beklemeden önce en az bu kadar konuşma geçmeli. */
  minSpeechMs?: number;
  /** Güvenlik sınırı: kayıt hiçbir durumda bunu aşmaz. */
  maxMs?: number;
  onAutoStop?: () => void;
  onLevel?: (level: number) => void;
};

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window.MediaRecorder !== "undefined"
  );
}

/** Tarayıcının desteklediği ilk biçim; sunucu tarafı bunların hepsini kabul ediyor. */
export function pickMimeType(): string | undefined {
  if (typeof window === "undefined" || !window.MediaRecorder?.isTypeSupported) {
    return undefined;
  }
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((type) => window.MediaRecorder.isTypeSupported(type));
}

export async function startRecording(
  options: RecorderOptions = {},
): Promise<Recorder | null> {
  if (!isRecordingSupported()) return null;

  const {
    silenceMs = 1600,
    threshold = 0.015,
    minSpeechMs = 700,
    maxMs = 60_000,
    onAutoStop,
    onLevel,
  } = options;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return null;
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(250);

  const audioContext = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);

  const startedAt = Date.now();
  let speechAt = 0;
  let quietSince = 0;
  let frame = 0;
  let finished = false;

  function cleanup() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    try {
      source.disconnect();
      void audioContext.close();
    } catch {
      // Kapatma hatası kaydı etkilemiyor.
    }
    for (const track of stream.getTracks()) track.stop();
  }

  function tick() {
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
    const level = Math.sqrt(sum / buffer.length);
    onLevel?.(level);

    const now = Date.now();
    if (level > threshold) {
      if (!speechAt) speechAt = now;
      quietSince = 0;
    } else if (speechAt && now - speechAt > minSpeechMs) {
      if (!quietSince) quietSince = now;
      else if (now - quietSince > silenceMs && !finished) {
        finished = true;
        onAutoStop?.();
        return;
      }
    }

    if (now - startedAt > maxMs && !finished) {
      finished = true;
      onAutoStop?.();
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  return {
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        finished = true;
        if (recorder.state === "inactive") {
          cleanup();
          resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
          return;
        }
        recorder.onstop = () => {
          cleanup();
          resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
        };
        recorder.stop();
      }),
    cancel: () => {
      finished = true;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // Zaten durmuş.
      }
      cleanup();
    },
  };
}

/**
 * Sunucuda üretilmiş sesi sırayla oynatır. Sunucu sesi gelmezse null döner
 * ve çağıran taraf tarayıcı sesine düşer — ders sessiz kalmasın.
 */
export async function speakFromServer(
  text: string,
  speaker: "ada" | "kerem",
  onEnd: () => void,
): Promise<{ stop: () => void } | null> {
  let parts: { url: string }[];
  try {
    const res = await fetch("/api/learning/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, speaker }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { parts?: { url: string }[] };
    if (!data.parts?.length) return null;
    parts = data.parts;
  } catch {
    return null;
  }

  const element = new Audio();
  let index = 0;
  let stopped = false;

  function next() {
    if (stopped) return;
    const part = parts[index];
    if (!part) {
      onEnd();
      return;
    }
    index += 1;
    element.src = part.url;
    void element.play().catch(() => {
      stopped = true;
      onEnd();
    });
  }

  element.onended = next;
  next();

  return {
    stop: () => {
      stopped = true;
      element.pause();
    },
  };
}

/**
 * Söyleneni yazılana ekler.
 *
 * Değiştirmek yerine eklemek bilinçli: mikrofon yazı alanının içinde duruyor ve
 * yanlışlıkla dokunmak öğrencinin yarım kalmış cümlesini silmemeli.
 */
export function mergeTranscript(existing: string, spoken: string): string {
  const next = spoken.trim();
  if (!next) return existing;
  const prev = existing.trim();
  return prev ? `${prev} ${next}` : next;
}

export async function transcribe(blob: Blob): Promise<string | null> {
  const form = new FormData();
  const ext = blob.type.includes("mp4")
    ? "m4a"
    : blob.type.includes("ogg")
      ? "ogg"
      : "webm";
  form.append("audio", blob, `answer.${ext}`);
  try {
    const res = await fetch("/api/learning/oral/transcribe", {
      method: "POST",
      body: form,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch {
    return null;
  }
}
