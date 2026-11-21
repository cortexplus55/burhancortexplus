"use client";

import { splitForFastStart } from "@/lib/speech/tutor-speech-lines";

/*
  Öğretmen sohbetinin sesi, tarayıcı tarafı (öğretmen v3, 21 Kasım 2026, ürün sahibi: "robot ses yok, doğal Türkçe
  öğretmen sesi"). Yanıt metni sunucuya gider (`POST /api/tutor/tts`); sunucu akademik simgeleri Türkçe okunuşa çevirip
  öğretmen üslubunda seslendirir. Tarayıcının kendi sesi (speechSynthesis) bu yolda hiç kullanılmaz.

  - Hızlı başlangıç: ilk cümleler ayrı istenir, ses ilk parça gelir gelmez başlar; kalanı aynı anda istenir.
  - Yeniden dinleme: aynı metnin ses parçaları bu sayfada bellekte durur, ikinci basışta istek atılmadan çalar (sunucuda
    da önbellek var: aynı cümle ücretlenmez).
  - Tek ses öğesi paylaşılır: yenisi başlayınca eskisi durur. iOS Safari'de ses ancak bir dokunuşla "açılmış" öğeden
    çalar; anahtara ve gönderime dokunuşta `primeTutorVoice` öğeyi sessizce açar.
*/

export type TutorVoiceProblem = "premium_required" | "insufficient_credits" | "unavailable";
type Part = { url: string; durationMs: number };

const ENDPOINT = "/api/tutor/tts";
/** 44 baytlık boş WAV: öğeyi bir dokunuşta açmak için. */
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
const MEMORY_LIMIT = 24;

const memory = new Map<string, Part[]>();
let element: HTMLAudioElement | null = null;
let session = 0;

function audioElement(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (!element) {
    element = new Audio();
    element.preload = "auto";
  }
  return element;
}

/** Dokunuş anında çağrılır: paylaşılan ses öğesini sessizce açar (iOS'ta kendiliğinden okuma için). */
export function primeTutorVoice(): void {
  const audio = audioElement();
  if (!audio || !audio.paused) return;
  try {
    audio.src = SILENT_WAV;
    void audio.play().catch(() => undefined);
  } catch {
    // Açılamazsa ilk ses dokunuşla çalar.
  }
}

/** Çalan sesi durdurur (yeni mesaj, sayfadan çıkış, ikinci 🔊). */
export function stopTutorVoice(): void {
  session += 1;
  if (element) {
    element.onended = null;
    element.onerror = null;
    element.pause();
  }
}

function remember(text: string, parts: Part[]) {
  if (memory.size >= MEMORY_LIMIT) memory.delete(memory.keys().next().value as string);
  memory.set(text, parts);
}

async function fetchParts(text: string): Promise<Part[] | TutorVoiceProblem> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = (await response.json().catch(() => null)) as { parts?: Part[]; code?: string } | null;
    if (response.ok && Array.isArray(data?.parts) && data.parts.length) return data.parts;
    const code = data?.code;
    if (response.status === 402 && code === "insufficient_credits") return "insufficient_credits";
    if (response.status === 402) return "premium_required";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Metni öğretmen sesiyle okur. `onEnd` ses bitince ya da durdurulunca bir kez; `onProblem` ses alınamazsa (ilk parça
 * gelmeden) bir kez. Dönüş: durdurma işlevi.
 */
export function playTutorVoice(
  text: string,
  handlers: { onStart?: () => void; onEnd: () => void; onProblem: (problem: TutorVoiceProblem) => void },
): () => void {
  stopTutorVoice();
  const mine = ++session;
  const audio = audioElement();
  const clean = text.trim();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    handlers.onEnd();
  };
  if (!audio || !clean) {
    finish();
    return () => undefined;
  }

  const queue: Part[] = [];
  let playing = false;
  let tailDone = false;
  const collected: Part[] = [];

  const playNext = () => {
    if (session !== mine) return finish();
    const next = queue.shift();
    if (!next) {
      playing = false;
      if (tailDone) finish();
      return;
    }
    playing = true;
    audio.onended = playNext;
    audio.onerror = playNext;
    audio.src = next.url;
    void audio.play().catch(() => {
      // Tarayıcı kendiliğinden çalmayı engelledi (dokunuş yok): sessizce bitir.
      if (session === mine) finish();
    });
  };

  const enqueue = (parts: Part[]) => {
    if (session !== mine) return;
    queue.push(...parts);
    collected.push(...parts);
    if (!playing) {
      handlers.onStart?.();
      playNext();
    }
  };

  const cached = memory.get(clean);
  if (cached) {
    tailDone = true;
    enqueue(cached);
  } else {
    const [head, tail] = splitForFastStart(clean);
    const headRequest = fetchParts(head || clean);
    const tailRequest = tail ? fetchParts(tail) : Promise.resolve([] as Part[]);
    void headRequest.then(async (first) => {
      if (session !== mine) return;
      if (typeof first === "string") {
        if (!finished) {
          finished = true;
          handlers.onProblem(first);
        }
        return;
      }
      enqueue(first);
      const rest = await tailRequest;
      if (session !== mine) return;
      tailDone = true;
      if (typeof rest !== "string") {
        if (rest.length) enqueue(rest);
        remember(clean, [...collected]);
      }
      if (!playing && !queue.length) finish();
    });
  }

  return () => {
    if (session === mine) stopTutorVoice();
    finish();
  };
}

/** Test kancası: bellekteki parçaları ve oturumu sıfırlar. */
export function resetTutorVoiceForTests(): void {
  memory.clear();
  stopTutorVoice();
  element = null;
}
