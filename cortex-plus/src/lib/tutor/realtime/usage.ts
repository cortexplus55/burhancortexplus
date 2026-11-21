import {
  REALTIME_MODEL,
  REALTIME_TRANSCRIBE_MODEL,
  emptyUsage,
  type RealtimeUsageSnapshot,
} from "@/lib/tutor/realtime/config";

/*
  Oturumun gider kaydı (21 Kasım 2026). Kredi dakika başına düşer (`billing.ts`); bu satırlar yalnız /admin/maliyetler
  ve kokpit içindir. Kullanımı istemci, Realtime'ın kendi `response.done` olaylarından toplar ve /tick ile /end'de
  gönderir: kredi buna bağlı olmadığı için eksik bildirim öğrenciye bedava konuşma vermez; yalnız gider tahmini düşer.
  Uç değerleri kırpar (negatif, ondalık, aşırı büyük sayı yok).

  `ai_model_prices` model adı başına tek girdi/çıktı fiyatı tuttuğu için ses, metin, görsel ve önbellekli girdi ayrı
  model adlarıyla yazılır (göç 20261121170000 fiyatları ekler):
    <model>                 metin girdi / metin çıktı
    <model>-audio           ses girdi / ses çıktı
    <model>-image           görsel girdi
    <model>-cached-text     önbellekli metin girdi
    <model>-cached-audio    önbellekli ses girdi
    <model>-cached-image    önbellekli görsel girdi
  Öğrencinin konuşmasının yazıya dökümü var olan `gpt-4o-mini-transcribe` satırına KİLOBAYT birimiyle yazılır (o satırın
  birimi; tohum göçü: dakikada ~180 KB). [varsayım] Girdi sesi saniyede ~10 jeton: kilobayt = jeton / 10 × 3.
*/

/** Bir oturumda makul üst sınır (30 dk konuşmanın birkaç katı): bozuk ya da şişirilmiş sayı kayda girmez. */
export const USAGE_FIELD_CAP = 5_000_000;
const AUDIO_TOKENS_PER_SECOND = 10;
const TRANSCRIBE_KB_PER_SECOND = 3;

const FIELDS = Object.keys(emptyUsage()) as (keyof RealtimeUsageSnapshot)[];

/** Gövdeden gelen kullanımı kırpar; tanınmayan alan düşer. */
export function sanitizeUsage(raw: unknown): RealtimeUsageSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const out = emptyUsage();
  let any = false;
  for (const field of FIELDS) {
    const value = Number(source[field]);
    if (!Number.isFinite(value) || value <= 0) continue;
    out[field] = Math.min(USAGE_FIELD_CAP, Math.floor(value));
    any = true;
  }
  return any ? out : null;
}

/** İki görüntüden büyük olanı (kümülatif sayaç geri gitmez). */
export function laterUsage(a: RealtimeUsageSnapshot | null, b: RealtimeUsageSnapshot | null): RealtimeUsageSnapshot | null {
  if (!a) return b;
  if (!b) return a;
  const out = emptyUsage();
  for (const field of FIELDS) out[field] = Math.max(a[field], b[field]);
  return out;
}

export type UsageRow = { model: string; tokensIn: number; tokensOut: number };

/** Kullanım → `ai_usage_events` satırları (sıfır satır yazılmaz). */
export function realtimeUsageRows(usage: RealtimeUsageSnapshot | null, model = REALTIME_MODEL): UsageRow[] {
  if (!usage) return [];
  const rows: UsageRow[] = [
    { model, tokensIn: usage.textIn, tokensOut: usage.textOut },
    { model: `${model}-audio`, tokensIn: usage.audioIn, tokensOut: usage.audioOut },
    { model: `${model}-image`, tokensIn: usage.imageIn, tokensOut: 0 },
    { model: `${model}-cached-text`, tokensIn: usage.cachedText, tokensOut: 0 },
    { model: `${model}-cached-audio`, tokensIn: usage.cachedAudio, tokensOut: 0 },
    { model: `${model}-cached-image`, tokensIn: usage.cachedImage, tokensOut: 0 },
  ];
  if (usage.transcribeAudio > 0) {
    const seconds = usage.transcribeAudio / AUDIO_TOKENS_PER_SECOND;
    rows.push({ model: REALTIME_TRANSCRIBE_MODEL, tokensIn: Math.max(1, Math.round(seconds * TRANSCRIBE_KB_PER_SECOND)), tokensOut: 0 });
  }
  return rows.filter((row) => row.tokensIn > 0 || row.tokensOut > 0);
}

/** Fiyat (bin jeton başına) → tahmini $; kokpit ve canlı deneme raporu aynı hesabı kullanır. */
export const REALTIME_PRICES_PER_1K: Record<string, { input: number; output: number }> = {
  [REALTIME_MODEL]: { input: 0.0006, output: 0.0024 },
  [`${REALTIME_MODEL}-audio`]: { input: 0.01, output: 0.02 },
  [`${REALTIME_MODEL}-image`]: { input: 0.0008, output: 0 },
  [`${REALTIME_MODEL}-cached-text`]: { input: 0.00006, output: 0 },
  [`${REALTIME_MODEL}-cached-audio`]: { input: 0.0003, output: 0 },
  [`${REALTIME_MODEL}-cached-image`]: { input: 0.00008, output: 0 },
  [REALTIME_TRANSCRIBE_MODEL]: { input: 0.016667, output: 0 },
};

export function estimateRealtimeUsd(usage: RealtimeUsageSnapshot | null): number {
  let total = 0;
  for (const row of realtimeUsageRows(usage)) {
    const price = REALTIME_PRICES_PER_1K[row.model];
    if (!price) continue;
    total += (row.tokensIn / 1000) * price.input + (row.tokensOut / 1000) * price.output;
  }
  return Math.round(total * 1e6) / 1e6;
}
