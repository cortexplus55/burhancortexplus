import type { Familiarity } from "@/lib/learning/session-signals";
import { istanbulDay } from "@/lib/istanbul-day";

/**
 * Ders açılışının iki ekranı.
 *
 * Aşinalık ve ruh hali zaten soruluyor. Eksik olan, kıyas ürünü ders
 * deneyiminde onların hemen ardından gelen kart: önce önerilen ders,
 * sonra "Ders oluştur". Slayt dersi bir sohbet değildir; metin bunu
 * "kısa bir ders" diye söyler.
 */
export const LESSON_OPEN_COPY = {
  skip: "Atla",
  familiarityTitle: "Bu konuya ne kadar aşinasın?",
  familiarityLead: "Bu, doğru zorluk seviyesini belirlememize yardımcı olur.",
  moodTitle: "Bugün ruh halin nasıl?",
  // Ruh hali yalnız kaydedilir (18 Ekim 2026): önceden yazılan ders ona göre değişemez.
  moodLead: "Cevabın çalışma geçmişine kaydedilir.",
  levelLabel: "Düzey",
  levelChange: "Değiştir",
  recommendedKicker: "ÖNERİLEN DERS",
  recommendedContinue: "Devam et",
  exploreTitle: "Konuyu öğretmeninle keşfet",
  exploreLead: "Bildiklerinin üzerine inşa etmek için kısa bir ders.",
  create: "Ders oluştur",
} as const;

/** Aşinalık kaydıracıyı başlatır. "İyi anlıyorum" sınav seviyesine zıplamaz. */
export function difficultyFromFamiliarity(
  level: Familiarity,
): "kolay" | "orta" | "ileri" {
  if (level === "new" || level === "heard") return "kolay";
  if (level === "confident") return "ileri";
  return "orta";
}

/**
 * Ruh halinden sonra doğrudan kurulum kartı (30 Ekim 2026): canlı turda derse girmeden iki ayrı "ÖNERİLEN DERS"
 * kartı art arda çıktı ("Devam et", sonra "Ders oluştur"); ikincisi aynı bilgiyi yineleyip bir dokunuş daha
 * istiyordu. Konu, düzey ve "Ders oluştur" tek kartta. Isınma yazımı bu kartta da başlar.
 */
export function stepAfterMood(kind: string): "recommend" | "setup" {
  void kind;
  return "setup";
}

/**
 * Ruh hali günde bir kez sorulur (19 Ekim 2026, ürün sahibinin kararı): kıyas ürününde hiç yok, bizde
 * her etkinlikten önce soruluyordu ve derste "ruh hali → önerilen ders" iki onay kartı art arda
 * çıkıyordu. Bugün (Türkiye günü) cevap verildiyse o kullanılır, kart atlanır.
 * Döner: bugünün Türkiye'de başladığı an (ISO), `created_at >=` sorgusu için.
 */
export function moodAskedSince(now: Date = new Date()): string {
  return new Date(`${istanbulDay(now)}T00:00:00+03:00`).toISOString();
}

/** Aşinalık biliniyorsa açılışın ilk ekranı: bugün ruh hali verildiyse doğrudan sonraki ekran. */
export function openingStage(
  kind: string,
  signals: { familiarityKnown: boolean; moodToday: boolean },
): "familiarity" | "mood" | "recommend" | "setup" {
  if (!signals.familiarityKnown) return "familiarity";
  return signals.moodToday ? stepAfterMood(kind) : "mood";
}

/** Açılış kartı atlandıysa bugün yeniden sorulmaz (3 Kasım 2026): tarayıcıda Türkiye gününe bağlı işaret. */
export function signalsSkipKey(now: Date = new Date()): string {
  return `cp-open-signals-skipped:${istanbulDay(now)}`;
}

export function signalsSkippedToday(storage: Pick<Storage, "getItem"> | null | undefined, now: Date = new Date()): boolean {
  try {
    return storage?.getItem(signalsSkipKey(now)) === "1";
  } catch {
    return false;
  }
}

export function markSignalsSkipped(storage: Pick<Storage, "setItem"> | null | undefined, now: Date = new Date()): void {
  try {
    storage?.setItem(signalsSkipKey(now), "1");
  } catch {
    /* gizli sekme: yalnız bu açılış atlanır */
  }
}

/**
 * Bugünkü açılış seçimi (3 Kasım 2026, Paket 1b): öğrenci aşinalık ya da ruh hali seçince aynı gün aynı hazırlıkta
 * kart yeniden çıkmaz; seçim kurulum kartında özet ("Düzey · Değiştir") olarak görünür. Türkiye gününe bağlı.
 */
export type SavedOpenSignals = { familiarity?: Familiarity; mood?: string };

export function signalsChoiceKey(prepId: string, now: Date = new Date()): string {
  return `cp-open-signals:${istanbulDay(now)}:${prepId}`;
}

const FAMILIARITY_LEVELS: readonly Familiarity[] = ["new", "heard", "basics", "good", "confident"];

export function readSavedSignals(storage: Pick<Storage, "getItem"> | null | undefined, prepId: string, now: Date = new Date()): SavedOpenSignals | null {
  try {
    const raw = storage?.getItem(signalsChoiceKey(prepId, now));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: SavedOpenSignals = {};
    if (FAMILIARITY_LEVELS.includes(parsed.familiarity as Familiarity)) out.familiarity = parsed.familiarity as Familiarity;
    if (typeof parsed.mood === "string" && parsed.mood) out.mood = parsed.mood;
    return out.familiarity || out.mood ? out : null;
  } catch {
    return null;
  }
}

export function saveSignalsChoice(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  prepId: string,
  choice: SavedOpenSignals,
  now: Date = new Date(),
): void {
  try {
    const prev = readSavedSignals(storage, prepId, now) ?? {};
    storage?.setItem(signalsChoiceKey(prepId, now), JSON.stringify({ ...prev, ...choice }));
  } catch {
    /* gizli sekme: yalnız bu açılış */
  }
}
