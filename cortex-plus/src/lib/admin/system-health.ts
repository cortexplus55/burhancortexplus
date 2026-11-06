import { DB_CRITICAL_SHARE, DB_WARN_SHARE, type DatabaseSize } from "@/lib/admin/ops-gauges";

/*
  Altyapı kartının saf kararları (6 Kasım 2026, /admin/sistem). Yoklamalar `system-probes.ts`'te (sunucu); burada
  yalnız "ölçüm → durum → rozet" eşlemesi, test ve sayfa aynı işlevi okur.

  Rozetler Türkçe ve beş tane: Çalışıyor, Uyarı, Kritik, Erişilemiyor, Ölçülemedi. "Ölçülemedi" bilerek ayrı: bir
  ölçümün okunamaması "çalışıyor" sayılmaz (5 Eylül 2026: yanlış "kurulu değil" satırı günlerce kimseyi uyarmadı).
*/

export type HealthState = "ok" | "warn" | "critical" | "down" | "unknown";

export const HEALTH_BADGE: Record<HealthState, { tone: "ok" | "warn" | "bad" | "mute"; label: string }> = {
  ok: { tone: "ok", label: "Çalışıyor" },
  warn: { tone: "warn", label: "Uyarı" },
  critical: { tone: "bad", label: "Kritik" },
  down: { tone: "bad", label: "Erişilemiyor" },
  unknown: { tone: "mute", label: "Ölçülemedi" },
};

export type HealthRow = { state: HealthState; detail: string };

const percent = (share: number) => `%${Math.round(share * 100)}`;
export const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024)).toLocaleString("tr-TR")} MB`;

function shareState(share: number): HealthState {
  if (share >= DB_CRITICAL_SHARE) return "critical";
  if (share >= DB_WARN_SHARE) return "warn";
  return "ok";
}

export function databaseHealth(database: Pick<DatabaseSize, "totalBytes" | "limitBytes" | "share"> | null): HealthRow {
  if (!database) return { state: "unknown", detail: "Boyut okunamadı (göç 20261031161000 uygulanmamış olabilir)." };
  const state = shareState(database.share);
  const tail =
    state === "critical"
      ? " Dolunca Supabase veritabanını salt okunur yapar: Pro'ya geçin."
      : state === "warn"
        ? " Supabase Pro'ya geçişi planlayın."
        : "";
  return {
    state,
    detail: `${megabytes(database.totalBytes)} / ${megabytes(database.limitBytes)} (${percent(database.share)}).${tail}`,
  };
}

/** Supabase ücretsiz planında dosya deposu 1 GB; Pro'ya geçince `SUPABASE_STORAGE_LIMIT_MB`. */
export const DEFAULT_STORAGE_LIMIT_MB = 1024;

export function storageLimitBytes(env: Record<string, string | undefined> = process.env): number {
  const mb = Number(env.SUPABASE_STORAGE_LIMIT_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_STORAGE_LIMIT_MB) * 1024 * 1024;
}

export type StorageSize = {
  totalBytes: number;
  objects: number;
  limitBytes: number;
  share: number;
  buckets: { name: string; bytes: number; objects: number }[];
};

/** `storage_size_report()` cevabı; biçim tutmazsa null ("ölçülemedi"). */
export function parseStorageReport(data: unknown, env: Record<string, string | undefined> = process.env): StorageSize | null {
  if (!data || typeof data !== "object") return null;
  const report = data as { total_bytes?: unknown; objects?: unknown; buckets?: unknown };
  const totalBytes = Number(report.total_bytes);
  if (!Number.isFinite(totalBytes) || totalBytes < 0) return null;
  const limitBytes = storageLimitBytes(env);
  const buckets = Array.isArray(report.buckets)
    ? report.buckets
        .map((row) => {
          const item = row as { name?: unknown; bytes?: unknown; objects?: unknown };
          return { name: String(item.name ?? ""), bytes: Number(item.bytes), objects: Number(item.objects) };
        })
        .filter((row) => row.name && Number.isFinite(row.bytes))
    : [];
  return {
    totalBytes,
    objects: Number.isFinite(Number(report.objects)) ? Number(report.objects) : 0,
    limitBytes,
    share: totalBytes / limitBytes,
    buckets,
  };
}

export function storageHealth(storage: StorageSize | null): HealthRow {
  if (!storage) return { state: "unknown", detail: "Ölçülemedi (göç 20261106170000 uygulanmamış olabilir)." };
  const state = shareState(storage.share);
  const tail = state === "critical" ? " Yükleme durabilir: Pro'ya geçin." : state === "warn" ? " Pro'ya geçişi planlayın." : "";
  return {
    state,
    detail: `${megabytes(storage.totalBytes)} / ${megabytes(storage.limitBytes)} (${percent(storage.share)}), ${storage.objects.toLocaleString("tr-TR")} dosya.${tail}`,
  };
}

export type RedisProbe = { configured: boolean; pong: boolean; breakerOpen: boolean };

export function redisHealth(probe: RedisProbe): HealthRow {
  if (!probe.configured) {
    return { state: "warn", detail: "Tanımsız: Hız Sınırı sayacı her sunucuda ayrı tutuluyor, sınır fiilen çalışmıyor." };
  }
  if (probe.pong) return { state: "ok", detail: "Bağlantı yanıt verdi; Hız Sınırı ve üretim yuvaları paylaşımlı." };
  return {
    state: "down",
    detail: probe.breakerOpen
      ? "Üst üste hata verdi, 30 sn atlanıyor; o arada sayaç sunucu başına."
      : "Yanıt vermedi; sayaç sunucu başına çalışıyor.",
  };
}

export type OpenAiReach = "ok" | "auth" | "quota" | "limited" | "down";

export type OpenAiProbe = { configured: boolean; reach: OpenAiReach | null; quotaSeenAt: string | null };

export function openAiHealth(probe: OpenAiProbe): HealthRow {
  if (!probe.configured) return { state: "down", detail: "Anahtar tanımsız: yapay zekâ hiç çalışmaz." };
  if (probe.quotaSeenAt || probe.reach === "quota") {
    return { state: "critical", detail: "Kredi bitti: dersler, testler, sohbet ve belge okuma düşüyor. OpenAI panelinde kredi yükleyin." };
  }
  switch (probe.reach) {
    case "ok":
      return { state: "ok", detail: "Model listesi okundu (ücretsiz yoklama, üretim yapılmadı)." };
    case "limited":
      return { state: "warn", detail: "Sağlayıcı şu an Hız Sınırı uyguluyor; istekler yavaşlayabilir." };
    case "auth":
      return { state: "down", detail: "Anahtar reddedildi: Vercel'deki anahtarı yenileyin." };
    case "down":
      return { state: "down", detail: "Sağlayıcıya ulaşılamadı (5 sn içinde yanıt yok)." };
    default:
      return { state: "unknown", detail: "Yoklama yapılamadı." };
  }
}

/** Kartın başlık rozeti: en kötü satır. */
export function worstHealth(states: HealthState[]): HealthState {
  const rank: Record<HealthState, number> = { ok: 0, unknown: 1, warn: 2, critical: 3, down: 4 };
  return states.reduce<HealthState>((worst, state) => (rank[state] > rank[worst] ? state : worst), "ok");
}
