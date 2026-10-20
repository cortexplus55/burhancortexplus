import { allowanceInWork } from "@/lib/credits/price-table";

/**
 * Kampanya ve beta kodları (19 Ekim 2026, satışa hazırlık Faz 5).
 *
 * Ürün sahibinin kararı: kapalı betada her öğrenciye **tek kullanımlık** kod; kod 14 gün Plus
 * açar, bitince hesap ücretsize döner. Kodlar yönetim panelinde toplu üretilir, öğrenci
 * Abonelik sayfasında girer (`/pay?kod=…` kutuyu doldurur). Kullanım tek SQL fonksiyonunda
 * (`redeem_promo_code`, göç `20261019160000`): kontrol, abonelik, cüzdan, kayıt, bildirim.
 *
 * Öğrenci kredi sayısı görmez: hediye kredi somut işle anlatılır.
 */
export const BETA_PLUS_DAYS = 14;
export const BETA_CODE_PREFIX = "BETA";
/** Karışan harfler yok (0/O, 1/I/L): kod kâğıttan ya da mesajdan elle yazılıyor. */
export const BETA_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const BETA_BATCH_MAX = 200;
/**
 * Ortak beta kodu (20 Ekim 2026, ürün sahibinin kararı: sosyal medya duyurusu için tek bağlantı,
 * ilk N kişi). Aynı kural geçerli: kişi başına bir kez, hesap başına tek deneme, ücretli aboneye açılmaz.
 */
export const SHARED_BETA_MAX_USES = 1000;
export const SHARED_BETA_DEFAULT_USES = 50;

export const PROMO_CODE_PATTERN = /^[A-Z0-9-]{3,40}$/;

/** Boşlukları atar, büyük harfe çevirir; tireler kalır ("beta-7kqm x3pd" → "BETA-7KQMX3PD"). */
export function normalizePromoCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toLocaleUpperCase("en-US");
}

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** "BETA-7KQM-X3PD": 8 harf, 31 harflik alfabe (~2^39 olasılık); tahminle bulunmaz. */
export function generateBetaCode(random: (count: number) => Uint8Array = randomBytes): string {
  const alphabet = BETA_CODE_ALPHABET;
  const chars: string[] = [];
  // Modulo yanlılığını önlemek için alfabe boyunun katının üstündeki baytlar atılır.
  const limit = 256 - (256 % alphabet.length);
  while (chars.length < 8) {
    for (const byte of random(16)) {
      if (byte >= limit) continue;
      chars.push(alphabet[byte % alphabet.length]!);
      if (chars.length === 8) break;
    }
  }
  return `${BETA_CODE_PREFIX}-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Bir partide birbirinden farklı `count` kod. */
export function generateBetaCodes(count: number, random?: (count: number) => Uint8Array): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateBetaCode(random));
  return [...codes];
}

export type RedeemReason =
  | "invalid_code"
  | "expired"
  | "already_redeemed"
  | "used_up"
  | "trial_used"
  | "already_premium"
  | "plan_missing";

export const REDEEM_MESSAGES: Record<RedeemReason, string> = {
  invalid_code: "Bu kod geçerli değil. Harfleri kontrol edip yeniden dene.",
  expired: "Bu kodun süresi dolmuş.",
  already_redeemed: "Bu kodu zaten kullandın.",
  // Ortak kodda da doğru (20 Ekim 2026): "her kod tek kişilik" 51. kişiye yanlış söylüyordu.
  used_up: "Bu kodun kullanım hakkı doldu.",
  trial_used: "Plus denemeni daha önce kullandın; bir hesap denemeyi bir kez alır.",
  already_premium: "Aboneliğin zaten açık. Bu kod deneme içindir; ücretli dönemine dokunmadık.",
  plan_missing: "Kod şu an kullanılamıyor. Biraz sonra yeniden dene.",
};

export function redeemFailureMessage(reason: string | null | undefined): string {
  return REDEEM_MESSAGES[(reason ?? "") as RedeemReason] ?? REDEEM_MESSAGES.invalid_code;
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });
}

export type RedeemSuccess = { plusDays: number | null; plusUntil: string | null; credits: number };

export function redeemSuccessMessage(result: RedeemSuccess): string {
  const parts: string[] = [];
  if (result.plusDays) {
    const until = result.plusUntil ? formatDay(result.plusUntil) : "";
    parts.push(
      `${result.plusDays} gün Plus açıldı${until ? ` · ${until} tarihine kadar` : ""}. Bitince ücretsiz hesapla devam edersin; ücret alınmaz.`,
    );
  }
  if (result.credits > 0) {
    const work = allowanceInWork(result.credits);
    parts.push(
      work.lessons > 0
        ? `Hediye eklendi: yaklaşık ${work.lessons} ders ya da ${work.messages} mesaj.`
        : "Hediye kullanım hakkı hesabına eklendi.",
    );
  }
  return parts.join(" ") || "Kod kullanıldı.";
}
