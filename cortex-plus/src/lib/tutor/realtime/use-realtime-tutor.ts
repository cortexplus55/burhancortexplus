"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeImage } from "@/lib/upload/compress-image";
import {
  REFUSAL_MESSAGE,
  type BoardCard,
  type RealtimeAccess,
  type RealtimeCreateResponse,
  type RealtimeEndReason,
  type RealtimeEndResponse,
  type RealtimeFailureCode,
  type RealtimeTickResponse,
} from "@/lib/tutor/realtime/config";
import { RealtimeEngine, type EngineEffect, type TranscriptUpdate } from "@/lib/tutor/realtime/engine";

/*
  Canlı sesli öğretmenin istemci kancası (21 Kasım 2026). WebRTC bağlantısını kurar (mikrofon → RTCPeerConnection →
  "oai-events" veri kanalı → teklif SDP'si BİZİM ucumuza), olayları `RealtimeEngine`'e verir, dakikayı sunucuya
  uzattırır (/tick), bitişte konuşmayı ve kullanımı /end ile gönderir. OpenAI'ye istemciden istek gitmez; medya ve veri
  kanalı WebRTC bağlantısının içinden akar (CSP'de değişiklik gerekmez).

  Hâller: idle → connecting ("Eğitmene bağlanılıyor...") → listening / thinking / speaking → ended | error.
  Hata türleri öğrenciye dostça çevrilir; kredi sayısı söylenmez, Plus daveti "Plus'ta" dilindedir.
*/

export type RealtimeTutorStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";

export type RealtimeTutorProblem =
  /** Mikrofon izni reddedildi. */
  | "mic_denied"
  /** Mikrofon yok ya da tarayıcı desteklemiyor. */
  | "mic_missing"
  /** Ücretsiz deneme kullanılmış ya da bitti: Plus daveti. */
  | "plus"
  /** Dönemin hakkı bitti. */
  | "quota"
  /** Bağlantı koptu. */
  | "network"
  /** Oturum tavanı (30 dk). */
  | "max_duration"
  | "failed";

export type RealtimeEndResult = { conversationId: string | null; seconds: number; reason: string };

export type RealtimeClientDeps = {
  fetch: typeof fetch;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createPeerConnection: () => RTCPeerConnection;
  createAudio: () => HTMLAudioElement;
  createAudioContext: () => AudioContext | null;
  now: () => number;
};

export type UseRealtimeTutorOptions = {
  conversationId?: string | null;
  prepId?: string | null;
  /** Uçların kökü (fikstürde başka bir uç). */
  endpoint?: string;
  onTranscript?: (turn: TranscriptUpdate) => void;
  onBoardCard?: (card: BoardCard) => void;
  onEnded?: (result: RealtimeEndResult) => void;
  deps?: Partial<RealtimeClientDeps>;
};

export type RealtimeTutorController = {
  status: RealtimeTutorStatus;
  problem: RealtimeTutorProblem | null;
  /** Sunucunun ya da kancanın öğrenciye görünen açıklaması. */
  message: string | null;
  access: RealtimeAccess | null;
  muted: boolean;
  /** Oturumun geçen süresi (sn). */
  elapsed: number;
  /** Denemede kalan süre (sn); ücretlide null. */
  trialLeft: number | null;
  cards: BoardCard[];
  start: () => Promise<void>;
  stop: () => void;
  toggleMute: () => void;
  sendImage: (file: File) => Promise<boolean>;
  /** Anlık ses düzeyleri (0-1): mikrofon ve öğretmen. Küre her karede okur. */
  readLevels: () => { input: number; output: number };
};

export const DEFAULT_REALTIME_ENDPOINT = "/api/tutor/realtime-session";

/** Görselin veri kanalına sığması için denenecek boylar (uzun kenar, kalite). */
const IMAGE_STEPS: readonly [number, number][] = [
  [1280, 0.8],
  [1024, 0.72],
  [800, 0.66],
  [640, 0.6],
  [512, 0.55],
];
/** SCTP üst sınırı bilinmiyorsa RFC 8841 varsayılanı. */
const DEFAULT_MAX_MESSAGE = 65_536;
const DISCONNECT_GRACE_MS = 8_000;
const TICK_RETRY_MS = 3_000;
const KEEPALIVE_LIMIT = 60_000;

function browserDeps(): RealtimeClientDeps {
  return {
    fetch: (...args) => globalThis.fetch(...args),
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createPeerConnection: () => new RTCPeerConnection(),
    createAudio: () => {
      const audio = new Audio();
      audio.autoplay = true;
      return audio;
    },
    createAudioContext: () => {
      const Ctor =
        typeof window !== "undefined"
          ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
          : undefined;
      try {
        return Ctor ? new Ctor() : null;
      } catch {
        return null;
      }
    },
    now: () => Date.now(),
  };
}

function problemFor(code: RealtimeFailureCode | string | undefined): RealtimeTutorProblem {
  if (code === "plus_required" || code === "trial_used" || code === "trial_over") return "plus";
  if (code === "quota") return "quota";
  if (code === "max_duration") return "max_duration";
  return "failed";
}

/** Oturumun bitiş sebebi → ekrandaki hâl. */
export function problemForEnd(reason: RealtimeEndReason): RealtimeTutorProblem {
  if (reason === "trial_over") return "plus";
  if (reason === "quota") return "quota";
  if (reason === "max_duration") return "max_duration";
  if (reason === "disconnected" || reason === "watchdog") return "network";
  return "failed";
}

function endMessageCode(reason: RealtimeEndReason, code: string | undefined): RealtimeFailureCode {
  if (code === "quota" || code === "trial_over" || code === "max_duration") return code;
  if (reason === "trial_over" || reason === "quota" || reason === "max_duration") return reason;
  return "failed";
}

function mediaProblem(error: unknown): RealtimeTutorProblem {
  const name = (error as { name?: unknown })?.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "mic_denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") return "mic_missing";
  return "failed";
}

export const MIC_DENIED_MESSAGE =
  "Mikrofon izni verilmedi. Adres çubuğundaki kilit simgesinden mikrofona izin ver, sonra yeniden dene.";
export const MIC_MISSING_MESSAGE = "Mikrofon bulunamadı ya da başka bir uygulama kullanıyor. Kontrol edip yeniden dene.";
export const NETWORK_MESSAGE = "Bağlantı koptu. Konuşulanlar sohbete kaydedildi; yeniden başlayabilirsin.";

/** Düzey ölçer: zaman alanındaki RMS, 0-1'e sıkıştırılmış. */
function meter(analyser: AnalyserNode | null, buffer: Uint8Array | null): number {
  if (!analyser || !buffer) return 0;
  analyser.getByteTimeDomainData(buffer as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = (buffer[index]! - 128) / 128;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / buffer.length) * 3.2);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function useRealtimeTutor(options: UseRealtimeTutorOptions): RealtimeTutorController {
  const endpoint = options.endpoint ?? DEFAULT_REALTIME_ENDPOINT;
  const [status, setStatus] = useState<RealtimeTutorStatus>("idle");
  const [problem, setProblem] = useState<RealtimeTutorProblem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [access, setAccess] = useState<RealtimeAccess | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [trialSeconds, setTrialSeconds] = useState<number | null>(null);
  const [cards, setCards] = useState<BoardCard[]>([]);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const depsRef = useRef<RealtimeClientDeps | null>(null);
  const deps = () => {
    if (!depsRef.current) depsRef.current = { ...browserDeps(), ...(optionsRef.current.deps ?? {}) };
    return depsRef.current;
  };

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const inputMeter = useRef<{ analyser: AnalyserNode; buffer: Uint8Array } | null>(null);
  const outputMeter = useRef<{ analyser: AnalyserNode; buffer: Uint8Array } | null>(null);
  const engineRef = useRef<RealtimeEngine | null>(null);
  const sessionRef = useRef<{
    id: string;
    startedAt: number;
    minuteSeconds: number;
    tickLead: number;
    maxSeconds: number;
    trialSeconds: number | null;
    paidMinutes: number;
  } | null>(null);
  const connectedRef = useRef(false);
  const finishingRef = useRef(false);
  const activeRef = useRef(false);
  /** Başlatma sırası: React geliştirme modunda bileşen kurulup söküp yeniden kurulur; eski başlatmanın bekleyen adımları yeninin yerine geçmesin. */
  const runRef = useRef(0);
  const pendingSends = useRef<string[]>([]);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef<(reason: RealtimeEndReason, opts?: { serverClosed?: boolean; code?: string }) => Promise<void>>(
    async () => undefined,
  );

  const clearTimers = () => {
    if (clockRef.current) clearInterval(clockRef.current);
    if (tickRef.current) clearTimeout(tickRef.current);
    if (dropRef.current) clearTimeout(dropRef.current);
    clockRef.current = null;
    tickRef.current = null;
    dropRef.current = null;
  };

  const teardownMedia = () => {
    try {
      dcRef.current?.close();
    } catch {
      // kapanmış
    }
    try {
      pcRef.current?.close();
    } catch {
      // kapanmış
    }
    micRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    void ctxRef.current?.close().catch(() => undefined);
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
    audioRef.current = null;
    ctxRef.current = null;
    inputMeter.current = null;
    outputMeter.current = null;
    pendingSends.current = [];
  };

  const send = (event: Record<string, unknown>) => {
    const payload = JSON.stringify(event);
    const channel = dcRef.current;
    if (channel && channel.readyState === "open") channel.send(payload);
    else pendingSends.current.push(payload);
  };

  const apply = (effects: EngineEffect[]) => {
    for (const effect of effects) {
      if (effect.type === "send") send(effect.event);
      else if (effect.type === "transcript") optionsRef.current.onTranscript?.(effect.turn);
      else if (effect.type === "card") {
        setCards((current) => [...current, effect.card]);
        optionsRef.current.onBoardCard?.(effect.card);
      } else if (effect.type === "status" && activeRef.current && !finishingRef.current) {
        setStatus(effect.status);
      }
    }
  };

  const attachMeter = (stream: MediaStream, target: typeof inputMeter) => {
    const context = ctxRef.current;
    if (!context) return;
    try {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      target.current = { analyser, buffer: new Uint8Array(analyser.fftSize) };
    } catch {
      target.current = null;
    }
  };

  const scheduleTick = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.trialSeconds != null) return;
    const minute = session.paidMinutes + 1;
    const dueAt = session.startedAt + ((minute - 1) * session.minuteSeconds - session.tickLead) * 1000;
    const wait = Math.max(0, dueAt - deps().now());
    if (tickRef.current) clearTimeout(tickRef.current);
    tickRef.current = setTimeout(() => void runTick(minute), wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTick = async (minute: number) => {
    const session = sessionRef.current;
    if (!session || finishingRef.current) return;
    try {
      const response = await deps().fetch(`${endpoint}/tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, minute, usage: engineRef.current?.usage }),
      });
      const data = (await response.json().catch(() => null)) as RealtimeTickResponse | null;
      if (data?.ok) {
        session.paidMinutes = Math.max(session.paidMinutes, data.minute);
        scheduleTick();
        return;
      }
      const code = data && !data.ok ? data.code : undefined;
      if (code === "quota" || code === "trial_over" || code === "max_duration" || code === "session_gone") {
        await finishRef.current(code === "session_gone" ? "watchdog" : code, { serverClosed: true, code });
        return;
      }
    } catch {
      // ağ: yeniden dene
    }
    if (finishingRef.current) return;
    tickRef.current = setTimeout(() => void runTick(minute), TICK_RETRY_MS);
  };

  const finish = async (reason: RealtimeEndReason, opts: { serverClosed?: boolean; code?: string } = {}) => {
    if (finishingRef.current || !activeRef.current) return;
    finishingRef.current = true;
    clearTimers();
    const session = sessionRef.current;
    const engine = engineRef.current;
    const seconds = session ? Math.max(0, Math.round((deps().now() - session.startedAt) / 1000)) : 0;
    teardownMedia();
    // Ekran beklemesin: son hâl hemen; konuşmanın kaydı arkadan gider, sohbet kimliği gelince bildirilir.
    activeRef.current = false;
    if (reason === "user" || reason === "replaced") {
      setStatus("ended");
    } else {
      const next = problemForEnd(reason);
      setProblem(next);
      setMessage(next === "network" ? NETWORK_MESSAGE : REFUSAL_MESSAGE[endMessageCode(reason, opts.code)]);
      setStatus("error");
    }
    let conversationId: string | null = optionsRef.current.conversationId ?? null;
    if (session && engine) {
      const transcript = engine.transcriptForEnd();
      const body = JSON.stringify({
        sessionId: session.id,
        reason,
        connected: connectedRef.current || engine.heard,
        turns: transcript.turns,
        cards: transcript.cards,
        usage: engine.usage,
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await deps().fetch(`${endpoint}/end`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: body.length < KEEPALIVE_LIMIT,
          });
          const data = (await response.json().catch(() => null)) as RealtimeEndResponse | null;
          if (data?.ok) {
            conversationId = data.conversationId ?? conversationId;
            break;
          }
          if (response.status < 500) break;
        } catch {
          // bir kez daha
        }
      }
    }
    optionsRef.current.onEnded?.({ conversationId, seconds, reason });
  };
  finishRef.current = finish;

  const fail = (next: RealtimeTutorProblem, text: string) => {
    clearTimers();
    teardownMedia();
    activeRef.current = false;
    setProblem(next);
    setMessage(text);
    setStatus("error");
  };

  const start = async () => {
    if (activeRef.current) return;
    const d = deps();
    activeRef.current = true;
    const run = ++runRef.current;
    /** Bu başlatma hâlâ geçerli mi (vazgeçilmedi ve yerine yenisi başlamadı). */
    const alive = () => activeRef.current && runRef.current === run;
    finishingRef.current = false;
    connectedRef.current = false;
    sessionRef.current = null;
    engineRef.current = new RealtimeEngine();
    setProblem(null);
    setMessage(null);
    setCards([]);
    setElapsed(0);
    setMuted(false);
    setTrialSeconds(null);
    setStatus("connecting");

    let mic: MediaStream;
    try {
      if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia && !optionsRef.current.deps?.getUserMedia) {
        throw Object.assign(new Error("no_media"), { name: "NotFoundError" });
      }
      mic = await d.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (error) {
      const kind = mediaProblem(error);
      fail(kind, kind === "mic_denied" ? MIC_DENIED_MESSAGE : kind === "mic_missing" ? MIC_MISSING_MESSAGE : REFUSAL_MESSAGE.failed);
      return;
    }
    if (!alive()) {
      mic.getTracks().forEach((track) => track.stop());
      return;
    }
    micRef.current = mic;
    ctxRef.current = d.createAudioContext();
    attachMeter(mic, inputMeter);

    let answer: Extract<RealtimeCreateResponse, { ok: true }>;
    try {
      const pc = d.createPeerConnection();
      pcRef.current = pc;
      const audio = d.createAudio();
      audioRef.current = audio;
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
        attachMeter(stream, outputMeter);
        connectedRef.current = true;
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          connectedRef.current = true;
          if (dropRef.current) clearTimeout(dropRef.current);
          dropRef.current = null;
        } else if (state === "failed") {
          void finishRef.current("disconnected");
        } else if (state === "disconnected" && !dropRef.current) {
          dropRef.current = setTimeout(() => {
            dropRef.current = null;
            if (pcRef.current?.connectionState !== "connected") void finishRef.current("disconnected");
          }, DISCONNECT_GRACE_MS);
        }
      };
      const track = mic.getAudioTracks()[0];
      if (track) pc.addTrack(track, mic);
      const channel = pc.createDataChannel("oai-events");
      dcRef.current = channel;
      channel.onopen = () => {
        connectedRef.current = true;
        for (const payload of pendingSends.current.splice(0)) channel.send(payload);
        apply(engineRef.current?.opened() ?? []);
      };
      channel.onmessage = (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (parsed && typeof parsed === "object") apply(engineRef.current?.handle(parsed as Record<string, unknown>) ?? []);
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await d.fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: offer.sdp,
          conversationId: optionsRef.current.conversationId ?? null,
          prepId: optionsRef.current.prepId ?? null,
        }),
      });
      const data = (await response.json().catch(() => null)) as RealtimeCreateResponse | null;
      if (!alive()) {
        // Bağlanırken vazgeçti ama sunucu oturumu açtı: hemen kapat (bağlantısız iade kuralı ilk dakikayı geri verir).
        if (data?.ok) {
          void d
            .fetch(`${endpoint}/end`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: data.sessionId, reason: "user", connected: false, turns: [] }),
              keepalive: true,
            })
            .catch(() => undefined);
        }
        return;
      }
      if (!data || !data.ok) {
        const code = data && !data.ok ? data.code : undefined;
        const text = data && !data.ok ? data.message : REFUSAL_MESSAGE.failed;
        fail(problemFor(code), text);
        return;
      }
      answer = data;
    } catch {
      if (alive()) fail("failed", REFUSAL_MESSAGE.failed);
      return;
    }
    if (!alive()) return;

    sessionRef.current = {
      id: answer.sessionId,
      startedAt: d.now(),
      minuteSeconds: answer.minuteSeconds,
      tickLead: answer.tickLeadSeconds,
      maxSeconds: answer.maxSeconds,
      trialSeconds: answer.trialSeconds,
      paidMinutes: 1,
    };
    setAccess(answer.access);
    setTrialSeconds(answer.trialSeconds);
    try {
      await pcRef.current?.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    } catch {
      await finishRef.current("error");
      return;
    }
    clockRef.current = setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;
      const seconds = Math.floor((deps().now() - session.startedAt) / 1000);
      setElapsed((current) => (current === seconds ? current : seconds));
      if (session.trialSeconds != null && seconds >= session.trialSeconds) void finishRef.current("trial_over");
      else if (seconds >= session.maxSeconds) void finishRef.current("max_duration");
    }, 250);
    scheduleTick();
  };

  const stop = () => {
    if (!activeRef.current) return;
    if (!sessionRef.current) {
      // Bağlanırken vazgeçti: sunucuda oturum yok.
      clearTimers();
      teardownMedia();
      activeRef.current = false;
      setStatus("ended");
      optionsRef.current.onEnded?.({ conversationId: optionsRef.current.conversationId ?? null, seconds: 0, reason: "user" });
      return;
    }
    void finishRef.current("user");
  };

  const toggleMute = () => {
    const track = micRef.current?.getAudioTracks()[0];
    setMuted((current) => {
      const next = !current;
      if (track) track.enabled = !next;
      return next;
    });
  };

  const sendImage = async (file: File): Promise<boolean> => {
    const channel = dcRef.current;
    const engine = engineRef.current;
    if (!channel || channel.readyState !== "open" || !engine || finishingRef.current) return false;
    const limit = Math.min(
      900_000,
      Math.max(16_000, (pcRef.current as (RTCPeerConnection & { sctp?: { maxMessageSize?: number } | null }) | null)?.sctp?.maxMessageSize || DEFAULT_MAX_MESSAGE),
    );
    for (const [maxSide, quality] of IMAGE_STEPS) {
      const encoded = await encodeImage(file, { maxSide, quality });
      if (!encoded) return false;
      const dataUrl = await blobToDataUrl(encoded.blob);
      // Olayın JSON zarfı ~200 bayt.
      if (dataUrl.length + 400 > limit) continue;
      apply(engine.image(dataUrl));
      return true;
    }
    return false;
  };

  const readLevels = () => ({
    input: muted ? 0 : meter(inputMeter.current?.analyser ?? null, inputMeter.current?.buffer ?? null),
    output: meter(outputMeter.current?.analyser ?? null, outputMeter.current?.buffer ?? null),
  });

  // Sayfa kapanırken ya da bileşen kalkarken oturum kapanır (sunucu ayrıca bekçiyle kapatır).
  useEffect(() => {
    const onHide = () => {
      if (activeRef.current && sessionRef.current) void finishRef.current("user");
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (activeRef.current) {
        if (sessionRef.current) void finishRef.current("user");
        else {
          clearTimers();
          teardownMedia();
          activeRef.current = false;
        }
      }
    };
     
  }, []);

  const trialLeft = trialSeconds == null ? null : Math.max(0, trialSeconds - elapsed);
  return { status, problem, message, access, muted, elapsed, trialLeft, cards, start, stop, toggleMute, sendImage, readLevels };
}
