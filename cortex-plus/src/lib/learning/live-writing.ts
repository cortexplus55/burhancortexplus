/**
 * Canlı Defter Modu (28 Kasım 2026): yol dersinde anlatım ve "Bu Konudan Aklında Kalsın" adımları kelime kelime
 * yazılıyormuş gibi açılır. Saf yardımcılar; model çağrısı, ağ isteği ve veritabanı yok.
 *
 * Kural: ham Markdown ya da TeX metni kelimeye bölünmez. Metin önce ders metninin kendi ayrıştırıcısıyla
 * (`splitMath` → formül; `studentTextParts` → kalın ve "==kilit==" vurgu) parçalanır; yalnız düz metin parçası
 * kelimelere ayrılır. Formül, kalın ve vurgulu ifade tek parça (atom) olarak açılır; ham "$" hiçbir an görünmez.
 */

export type LiveLook = "gece" | "defter";
export type LiveSpeed = 1 | 2;

/** Tarayıcıda saklanan tercihler (yalnız bu cihaz; sunucuya gitmez). */
export const LIVE_PREF_KEYS = { look: "cp:ders:gorunum", speed: "cp:ders:hiz" } as const;

export const DEFAULT_LIVE_LOOK: LiveLook = "gece";
export const DEFAULT_LIVE_SPEED: LiveSpeed = 1;

export function parseLiveLook(raw: unknown): LiveLook {
  return raw === "defter" ? "defter" : DEFAULT_LIVE_LOOK;
}

export function parseLiveSpeed(raw: unknown): LiveSpeed {
  return raw === "2" || raw === 2 ? 2 : DEFAULT_LIVE_SPEED;
}

/**
 * Düz metni kelime parçalarına böler; boşluk kelimenin sonunda kalır (satır kırılması ve aralık bozulmaz).
 * Parçalar birleşince metnin aynısıdır.
 */
export function splitLiveWords(text: string): string[] {
  if (!text) return [];
  return text.match(/\S+\s*|\s+/gu) ?? [text];
}

/**
 * Açılış bedeli: kelime 1, formül ya da vurgulu ifade 2 (bir an durulur), kutu/kart 4 (okunacak yer açılır).
 * Hız bu birimlerle ölçülür.
 */
export const LIVE_COST = { word: 1, atom: 2, block: 4 } as const;
export type LiveUnitKind = keyof typeof LIVE_COST;

/** 1× hız: saniyede en az bu kadar birim. Uzun adımda hız artar, adım en çok `LIVE_MAX_SECONDS` sürer. */
export const LIVE_BASE_RATE = 14;
export const LIVE_MAX_SECONDS = 10;

/** Saniyede açılan birim: uzun adım öğrenciyi bekletmesin diye toplam süre tavanlı; 2× iki katı. */
export function liveRate(totalCost: number, speed: LiveSpeed): number {
  const base = Math.max(LIVE_BASE_RATE, totalCost / LIVE_MAX_SECONDS);
  return base * speed;
}

/** Her birimin başladığı nokta (önceki birimlerin bedeli toplamı). */
export function liveStarts(costs: readonly number[]): number[] {
  const starts: number[] = [];
  let sum = 0;
  for (const cost of costs) {
    starts.push(sum);
    sum += cost;
  }
  return starts;
}

/** İlerleme `progress` iken açılmış birim sayısı: başlangıcı ilerlemeyi geçmeyenler (ilk birim hemen açılır). */
export function liveRevealedCount(starts: readonly number[], progress: number): number {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (starts[mid]! <= progress) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Adım kendiliğinden yazılır mı: yalnız yazılabilir adımda (anlatım ya da kapanış), dersin ilk açılışında
 * (başlanmış derste, "Tekrar incele"de ve "Dersi tekrarla"da değil), adıma bu oturumda ilk girişte ve hareket
 * azaltma kapalıyken. Geri dönülen adım tam açık gelir; isteyen "Tekrar oynat"a basar.
 */
export function liveAutoplay(input: { typeable: boolean; autoplay: boolean; reducedMotion: boolean; visited: boolean }): boolean {
  return input.typeable && input.autoplay && !input.reducedMotion && !input.visited;
}
