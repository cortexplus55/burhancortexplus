import { priceForModel, type ModelPrice } from "@/lib/billing/model-price";
import { WINDOW_KEYS, type WindowKey, type Windows } from "@/lib/admin/cockpit-math";

/*
  Kokpitin "Canlı sesli öğretmen" kartının saf hesapları (21 Kasım 2026). Veritabanı yok; `voice-cockpit.ts` okur, burası
  sayar. Pencereler kokpitinkiler (Türkiye günü: bugün, son 7, son 30 gün).

  Tanımlar:
  - Sesli dakika: ödenen dakika (kesinleşmiş `REALTIME_VOICE_MINUTE` ayırması; kurucunun dakikası da, SQL onu 0 kredi
    yazar) + ücretsiz deneme oturumu başına bir dakika (deneme en çok 60 sn). İade edilen ve henüz bekleyen dakika yok.
  - Oturum: ilk dakikası kesinleşmiş ücretli oturum (anahtar `realtime_voice:<oturum>:m1`) + kalan deneme kaydı
    (bağlantı kurulamayan denemenin kaydı silinir, sayılmaz).
  - Gerçek maliyet ($): `REALTIME_VOICE` kullanım satırları × fiyat satırı (`ai_model_prices`); fiyat satırı yoksa satırın
    kendi tahmini; ikisi de yoksa "fiyatsız" sayılır ve ekranda söylenir.
  - Denemeyi kullanan kişi: penceredeki deneme kaydının farklı öğrencileri.
  - Denemeden sonra Plus'a geçen: denemesinden SONRAKİ ilk başarılı paket ödemesi (Plus, Sınav Haftası, Sigma; ek paket
    değil) pencerede olan kişi. Kişi = hakkın sahibi (veli ödemesinde öğrenci).
*/

export type VoiceCount = Record<WindowKey, number | null>;
export type VoiceMoney = Record<WindowKey, number | null>;

export type VoiceReservation = { userId: string; key: string; status: string; at: string };
export type VoiceTrialMark = { userId: string; at: string };
export type VoiceUsage = { model: string; tokensIn: number; tokensOut: number; estimate: number | null; at: string };
export type VoicePayment = { userId: string; beneficiaryId: string | null; status: string; at: string; planSlug: string | null };

export type VoiceCockpit = {
  minutes: VoiceCount;
  sessions: VoiceCount;
  costUsd: VoiceMoney;
  /** Fiyatı bulunamayan kullanım satırı (penceredeki). */
  unpriced: VoiceCount;
  trialUsers: VoiceCount;
  convertedAfterTrial: VoiceCount;
};

const FIRST_MINUTE = /^realtime_voice:[^:]+:m1$/;

/** Ücretli plan mı (ek paket değil). */
export function subscriptionPlan(slug: string | null | undefined): boolean {
  return typeof slug === "string" && /^(plus|sigma)/.test(slug);
}

function inWindow(at: string, since: string): boolean {
  const time = Date.parse(at);
  return Number.isFinite(time) && time >= Date.parse(since);
}

function perWindow<T>(windows: Windows, fn: (since: string) => T): Record<WindowKey, T> {
  const out = {} as Record<WindowKey, T>;
  for (const key of WINDOW_KEYS) out[key] = fn(windows[key]);
  return out;
}

const rounded = (value: number) => Math.round(value * 1e4) / 1e4;

export function voiceCockpit(input: {
  windows: Windows;
  /** null: kaynak okunamadı (o sayılar "okunamadı"). */
  reservations: VoiceReservation[] | null;
  trials: VoiceTrialMark[] | null;
  usage: VoiceUsage[] | null;
  prices: ReadonlyMap<string, ModelPrice> | null;
  payments: VoicePayment[] | null;
}): VoiceCockpit {
  const { windows } = input;
  const committed = input.reservations?.filter((row) => row.status === "committed") ?? null;

  const minutes = perWindow(windows, (since) =>
    committed && input.trials
      ? committed.filter((row) => inWindow(row.at, since)).length + input.trials.filter((row) => inWindow(row.at, since)).length
      : null,
  );
  const sessions = perWindow(windows, (since) =>
    committed && input.trials
      ? committed.filter((row) => FIRST_MINUTE.test(row.key) && inWindow(row.at, since)).length +
        input.trials.filter((row) => inWindow(row.at, since)).length
      : null,
  );

  const costUsd = perWindow(windows, (since) => {
    if (!input.usage) return null;
    let total = 0;
    for (const row of input.usage) {
      if (!inWindow(row.at, since)) continue;
      const price = input.prices ? priceForModel(row.model, input.prices) : null;
      if (price) total += (row.tokensIn / 1000) * price.input + (row.tokensOut / 1000) * price.output;
      else if (row.estimate != null) total += row.estimate;
    }
    return rounded(total);
  });
  const unpriced = perWindow(windows, (since) =>
    input.usage
      ? input.usage.filter(
          (row) => inWindow(row.at, since) && !(input.prices && priceForModel(row.model, input.prices)) && row.estimate == null,
        ).length
      : null,
  );

  const trialUsers = perWindow(windows, (since) =>
    input.trials ? new Set(input.trials.filter((row) => inWindow(row.at, since)).map((row) => row.userId)).size : null,
  );

  // Kişinin denemesi (en eskisi) ve denemesinden sonraki ilk başarılı paket ödemesi.
  const trialAt = new Map<string, number>();
  for (const row of input.trials ?? []) {
    const at = Date.parse(row.at);
    if (!Number.isFinite(at)) continue;
    const known = trialAt.get(row.userId);
    if (known == null || at < known) trialAt.set(row.userId, at);
  }
  const firstPaidAfterTrial = new Map<string, number>();
  for (const payment of input.payments ?? []) {
    if (payment.status !== "paid" || !subscriptionPlan(payment.planSlug)) continue;
    const owner = payment.beneficiaryId ?? payment.userId;
    const trial = trialAt.get(owner);
    const at = Date.parse(payment.at);
    if (trial == null || !Number.isFinite(at) || at <= trial) continue;
    const known = firstPaidAfterTrial.get(owner);
    if (known == null || at < known) firstPaidAfterTrial.set(owner, at);
  }
  const convertedAfterTrial = perWindow(windows, (since) =>
    input.trials && input.payments
      ? [...firstPaidAfterTrial.values()].filter((at) => at >= Date.parse(since)).length
      : null,
  );

  return { minutes, sessions, costUsd, unpriced, trialUsers, convertedAfterTrial };
}
