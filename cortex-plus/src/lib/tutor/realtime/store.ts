import "server-only";
import { randomUUID } from "node:crypto";
import { rateLimitBackend, redisPipeline } from "@/lib/rate-limit";
import type { MinuteEntry } from "@/lib/tutor/realtime/billing";
import {
  REALTIME_MAX_SESSION_SECONDS,
  type RealtimeAccess,
  type RealtimeEndReason,
  type RealtimeUsageSnapshot,
} from "@/lib/tutor/realtime/config";

/*
  Oturum durumu (21 Kasım 2026). Süre ve kredi sunucuda tutulur: oturum açılışı, /tick, /end ve bekçi farklı sunucu
  örneklerine düşebildiği için durum Redis'te (Upstash), oturum başına tek anahtar. Redis yapılandırılmamışsa (yerel
  geliştirme) süreç belleğinde. Redis yapılandırılmış ama ulaşılamıyorsa okuma/yazma "unavailable" döner: yeni oturum
  açılmaz (dakika sayılamaz), bekçi elindeki çağrı kimliğiyle çağrıyı kapatır (bedava konuşma kalmasın).

  Anahtarlar: rt:s:<oturum> (durum), rt:u:<öğrenci> (öğrencinin açık oturumu), rt:l:<oturum> (kısa kilit),
  rt:nc:<öğrenci>:<gün> (bağlantısız iade sayacı). Süreleri oturum tavanının bir saat fazlası.
*/

export type RealtimeSessionState = {
  id: string;
  userId: string;
  /** OpenAI çağrı kimliği (Location başlığının son parçası). */
  callId: string | null;
  access: RealtimeAccess;
  /** Sunucu saatiyle oturumun başladığı an (OpenAI çağrısı kurulunca). */
  startedAt: number;
  status: "active" | "ended";
  minutes: MinuteEntry[];
  endedAt: number | null;
  endReason: RealtimeEndReason | null;
  conversationId: string | null;
  prepId: string | null;
  /** Denemenin kanıt satırı (`ai_usage_events`), geri vermek için. */
  trialMarkerId: string | null;
  usage: RealtimeUsageSnapshot | null;
  usageRecorded: boolean;
  /** Konuşma metni sohbete yazıldı mı (bir kez). */
  saved: boolean;
  savedConversationId: string | null;
};

export type StoreResult<T> = { ok: true; value: T } | { ok: false; reason: "unavailable" };

export type RealtimeStore = {
  get(sessionId: string): Promise<StoreResult<RealtimeSessionState | null>>;
  put(state: RealtimeSessionState): Promise<boolean>;
  userSession(userId: string): Promise<StoreResult<string | null>>;
  setUserSession(userId: string, sessionId: string): Promise<boolean>;
  /** Kısa süreli kilit; alınamazsa null. Dönen işlev kilidi bırakır. */
  lock(sessionId: string): Promise<(() => Promise<void>) | null>;
  /** Günlük sayaç: artırıp yeni değeri döner; okunamazsa null. */
  incrementDaily(key: string, ttlSeconds: number): Promise<number | null>;
};

const TTL_SECONDS = REALTIME_MAX_SESSION_SECONDS + 3600;
const LOCK_MS = 8_000;
const LOCK_TRIES = 25;
const LOCK_WAIT_MS = 120;

const sessionKey = (id: string) => `rt:s:${id}`;
const userKey = (id: string) => `rt:u:${id}`;
const lockKey = (id: string) => `rt:l:${id}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseState(raw: unknown): RealtimeSessionState | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const value = JSON.parse(raw) as RealtimeSessionState;
    return value && typeof value.id === "string" && typeof value.userId === "string" ? value : null;
  } catch {
    return null;
  }
}

export function redisStore(): RealtimeStore {
  return {
    async get(sessionId) {
      const result = await redisPipeline([["GET", sessionKey(sessionId)]]);
      if (!result) return { ok: false, reason: "unavailable" };
      return { ok: true, value: parseState(result[0]) };
    },
    async put(state) {
      const result = await redisPipeline([["SET", sessionKey(state.id), JSON.stringify(state), "EX", String(TTL_SECONDS)]]);
      return Boolean(result && result[0] === "OK");
    },
    async userSession(userId) {
      const result = await redisPipeline([["GET", userKey(userId)]]);
      if (!result) return { ok: false, reason: "unavailable" };
      return { ok: true, value: typeof result[0] === "string" && result[0] ? result[0] : null };
    },
    async setUserSession(userId, sessionId) {
      const result = await redisPipeline([["SET", userKey(userId), sessionId, "EX", String(TTL_SECONDS)]]);
      return Boolean(result && result[0] === "OK");
    },
    async lock(sessionId) {
      const token = randomUUID();
      for (let attempt = 0; attempt < LOCK_TRIES; attempt += 1) {
        const result = await redisPipeline([["SET", lockKey(sessionId), token, "NX", "PX", String(LOCK_MS)]]);
        if (!result) return null;
        if (result[0] === "OK") {
          return async () => {
            const held = await redisPipeline([["GET", lockKey(sessionId)]]);
            if (held && held[0] === token) await redisPipeline([["DEL", lockKey(sessionId)]]);
          };
        }
        await sleep(LOCK_WAIT_MS);
      }
      return null;
    },
    async incrementDaily(key, ttlSeconds) {
      const result = await redisPipeline([["INCR", key], ["EXPIRE", key, String(ttlSeconds)]]);
      if (!result) return null;
      const value = Number(result[0]);
      return Number.isFinite(value) ? value : null;
    },
  };
}

/** Süreç belleğinde (Redis yoksa ve fikstürde). */
export function memoryStore(): RealtimeStore {
  const sessions = new Map<string, { at: number; value: RealtimeSessionState }>();
  const users = new Map<string, string>();
  const locks = new Map<string, number>();
  const counters = new Map<string, { value: number; until: number }>();
  return {
    async get(sessionId) {
      const hit = sessions.get(sessionId);
      if (!hit || Date.now() - hit.at > TTL_SECONDS * 1000) return { ok: true, value: null };
      return { ok: true, value: structuredClone(hit.value) };
    },
    async put(state) {
      sessions.set(state.id, { at: Date.now(), value: structuredClone(state) });
      return true;
    },
    async userSession(userId) {
      return { ok: true, value: users.get(userId) ?? null };
    },
    async setUserSession(userId, sessionId) {
      users.set(userId, sessionId);
      return true;
    },
    async lock(sessionId) {
      for (let attempt = 0; attempt < LOCK_TRIES; attempt += 1) {
        const until = locks.get(sessionId) ?? 0;
        if (until < Date.now()) {
          const mine = Date.now() + LOCK_MS;
          locks.set(sessionId, mine);
          return async () => {
            if (locks.get(sessionId) === mine) locks.delete(sessionId);
          };
        }
        await sleep(LOCK_WAIT_MS);
      }
      return null;
    },
    async incrementDaily(key, ttlSeconds) {
      const now = Date.now();
      const hit = counters.get(key);
      const value = hit && hit.until > now ? hit.value + 1 : 1;
      counters.set(key, { value, until: hit && hit.until > now ? hit.until : now + ttlSeconds * 1000 });
      return value;
    },
  };
}

let shared: RealtimeStore | null = null;

/** Varsayılan depo: Redis yapılandırılmışsa Redis, değilse süreç belleği (süreç başına tek). */
export function defaultRealtimeStore(): RealtimeStore {
  if (!shared) shared = rateLimitBackend() === "redis" ? redisStore() : memoryStore();
  return shared;
}

/** Yalnız testler. */
export function resetRealtimeStoreForTests(): void {
  shared = null;
}
