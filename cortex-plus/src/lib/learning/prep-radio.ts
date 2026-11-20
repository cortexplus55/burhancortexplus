/**
 * Sınav Radyosu (Faz 7, 20 Kasım 2026): hazırlığın DAHA ÖNCE ÜRETİLMİŞ ve sesi tamamen önbellekte olan podcast'leri
 * sırayla, 0 kredi ve 0 yeni seslendirmeyle (ürün sahibinin kararı, 20 Kasım 2026: "0 kredi" yazılabilir). Ses ucu
 * yalnız önbellekten okur (`/api/learning/exam-prep/radio`, `cachedAudioOnly`); önbellekte olmayan tek satır varsa
 * bölüm 409 `not_cached` alır ve radyo onu atlar.
 *
 * Saf modül (istemci de okur): sıra, hız, 15 sn atlama ve zaman çizelgesi hesabı.
 */

export const PREP_RADIO_LABEL = "🎧 Sınav Radyosu (Ücretsiz Dinle)";
export const PREP_RADIO_NAME = "Sınav Radyosu";
export const PREP_RADIO_SKIPPED = "Bu bölümün sesi hazır değil; radyo sıradakine geçti.";
export const PREP_RADIO_EMPTY = "Dinlenecek hazır bölüm kalmadı.";
export const PREP_RADIO_FINISHED = "Liste bitti. Baştan dinlemek için oynat.";
export const PREP_RADIO_FAILED = "Ses şu an açılamadı.";

/** Giriş düğmesinin alt satırı: "3 hazır bölüm sırayla · 0 kredi". */
export function radioEntrySub(count: number): string {
  return `${count} hazır bölüm sırayla · 0 kredi`;
}

export const RADIO_SPEEDS = [1, 1.25, 1.5, 2] as const;
export type RadioSpeed = (typeof RADIO_SPEEDS)[number];
export const RADIO_SKIP_MS = 15_000;
/** Önceki düğmesi: bölümün başından bu kadar geçtiyse başa sarar, geçmediyse önceki bölüme gider. */
export const RADIO_RESTART_MS = 3_000;

/** Radyonun çaldığı birim: bir kayıtlı podcast bölümü (hazırlık + konu + tür). */
export type RadioItem = { id: string; title: string; topicLabel: string };

export type RadioCandidate = RadioItem & {
  /** Konu anahtarı (`podcastTopicKey`, türev eki atılmış); yolun konu sırasıyla eşlenir. */
  topicKey: string;
  createdAt: string;
  /** Aynı içeriğin iki kaydı (ör. kontrollü ve kontrolsüz önbellek) bir kez çalsın. */
  signature: string;
};

/**
 * Sıra: önce hazırlığın yol / konu sırası (`topicKeysInOrder`, ilk geçiş sayılır), sonra kayıt zamanı (eskiden
 * yeniye), en son kimlik. Sırada olmayan konu sona. Aynı içerik bir kez.
 */
export function orderRadioPlaylist(candidates: readonly RadioCandidate[], topicKeysInOrder: readonly string[]): RadioCandidate[] {
  const rank = new Map<string, number>();
  topicKeysInOrder.forEach((key, index) => {
    if (key && !rank.has(key)) rank.set(key, index);
  });
  const time = (value: string) => {
    const at = Date.parse(value);
    return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY;
  };
  const sorted = [...candidates].sort((a, b) => {
    const ra = rank.get(a.topicKey) ?? Number.POSITIVE_INFINITY;
    const rb = rank.get(b.topicKey) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    const ta = time(a.createdAt);
    const tb = time(b.createdAt);
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const seen = new Set<string>();
  return sorted.filter((item) => {
    if (seen.has(item.signature)) return false;
    seen.add(item.signature);
    return true;
  });
}

export function nextRadioSpeed(speed: number): RadioSpeed {
  const index = RADIO_SPEEDS.indexOf(speed as RadioSpeed);
  return RADIO_SPEEDS[(index + 1) % RADIO_SPEEDS.length]!;
}

/** "1×", "1,25×": Türkçe ondalık. */
export function radioSpeedLabel(speed: number): string {
  return `${String(speed).replace(".", ",")}×`;
}

export type RadioTrack = { url: string; durationMs: number; text: string };

/** Her satırın bölüm içindeki başlangıcı (ms) ve bölümün toplam süresi. */
export function radioTimeline(tracks: readonly Pick<RadioTrack, "durationMs">[]): { starts: number[]; totalMs: number } {
  const starts: number[] = [];
  let cursor = 0;
  for (const track of tracks) {
    starts.push(cursor);
    cursor += Math.max(0, Number.isFinite(track.durationMs) ? track.durationMs : 0);
  }
  return { starts, totalMs: cursor };
}

/** Bölüm içindeki bir an hangi satırda, satırın kaçıncı ms'sinde. Aralık dışı an uca kenetlenir. */
export function locateRadioTime(
  timeline: { starts: readonly number[]; totalMs: number },
  ms: number,
): { index: number; offsetMs: number } {
  const { starts, totalMs } = timeline;
  if (!starts.length) return { index: 0, offsetMs: 0 };
  const clamped = Math.max(0, Math.min(ms, Math.max(0, totalMs - 1)));
  let index = 0;
  for (let at = 0; at < starts.length; at += 1) {
    if (starts[at]! <= clamped) index = at;
    else break;
  }
  return { index, offsetMs: clamped - starts[index]! };
}

/** "4:05" (saat varsa "1:02:05"). */
export function formatRadioClock(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
