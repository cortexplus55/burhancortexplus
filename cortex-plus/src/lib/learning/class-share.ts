import { appOrigin } from "@/lib/app-url";
import { whatsappShareHref } from "@/lib/learning/duel-share";

/**
 * "📲 Sınıfla Paylaş" ve paylaşılan çalışma yolunu klonlama (Faz 7, 20 Kasım 2026, ürün sahibinin kararları). Saf
 * modül: istemci de okur. Öğrenci hazırlığının kısa paylaşım kodunu açar; bağlantı `/davet/<kod>`. Arkadaşı bağlantıyı
 * açınca hazırlığın konu haritası ve 1. ünitenin (1. konu) hazır dersi kendi hesabına kopyalanır; belge, cevap ve sonuç
 * kopyalanmaz. Kod tahmin edilemez (10 karakter, ~8·10¹⁴ olasılık) ve kopyalama ucu hız sınırlı.
 *
 * Ödül: arkadaş 1. ünitenin konu testini bitirince paylaşana +50 kredi; ayda en çok 5 arkadaş. Kurallar SQL'de
 * (`claim_clone_referral_reward`, göç 20261120140000); buradaki sayılar ekran metni içindir ve bekçi test SQL'deki
 * sabitlerle karşılaştırır. Ürün sahibinin kararıyla bu ödülde kredi sayısı ekranda yazılır ("+50 Bonus Kredi").
 */

/** Karışan harf yok: i, l, o, 0, 1 alfabede değil. */
export const SHARE_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const SHARE_CODE_LENGTH = 10;
const SHARE_CODE_PATTERN = new RegExp(`^[${SHARE_CODE_ALPHABET}]{${SHARE_CODE_LENGTH}}$`);

export const CLONE_REWARD_CREDITS = 50;
export const CLONE_REWARD_MONTHLY_CAP = 5;
/** Faz 8 (20 Kasım 2026): aynı IP'den (klonlayan istek) İstanbul gününde en çok bu kadar ödül; katı "aynı IP" engelinin yerine. */
export const CLONE_REWARD_IP_DAILY_CAP = 3;

export const CLASS_SHARE_LABEL = "📲 Sınıfla Paylaş";
export const CLONE_BUTTON_LABEL = "Bu Çalışma Yolunu Hesabıma Klonla (1. Ünite Ücretsiz)";
export const CLONE_REWARD_TITLE = `Arkadaşın 1. üniteyi bitirdi · +${CLONE_REWARD_CREDITS} Bonus Kredi`;
export const CLONE_REWARD_BODY = `Paylaştığın çalışma yolunu klonlayan arkadaşın 1. ünitenin konu testini bitirdi; +${CLONE_REWARD_CREDITS} Bonus Kredi hesabına eklendi.`;
export const CLASS_SHARE_NOTE =
  "Arkadaşın bağlantıyı açınca aynı çalışma yolu ve 1. ünitenin dersi kendi hesabına kopyalanır; senin notların ve sonuçların paylaşılmaz.";
export const CLASS_SHARE_REWARD_NOTE = `Arkadaşın 1. ünitenin konu testini bitirince sana +${CLONE_REWARD_CREDITS} Bonus Kredi (ayda en çok ${CLONE_REWARD_MONTHLY_CAP} arkadaş). Davet hediyesi alan arkadaş için iki ödül birden verilmez.`;
/** Sınav sabahı kâğıdının QR notu (ürün sahibinin metni). */
export const CRAM_QR_NOTE =
  "Bu özet kağıdının interaktif testini, sesli podcastini ve 1 dk çizimli videosunu kendi telefonunda ücretsiz çözmek için QR kodu okut";

/** Yeni kod (sunucu çağırır; `pick` test için rastgeleliği verir). */
export function generateShareCode(pick: (alphabetSize: number) => number): string {
  let code = "";
  for (let index = 0; index < SHARE_CODE_LENGTH; index += 1) code += SHARE_CODE_ALPHABET[pick(SHARE_CODE_ALPHABET.length)];
  return code;
}

/** Adresten gelen kod: küçük harfe indirilir; biçim tutmazsa null (veritabanına hiç sorulmaz). */
export function normalizeShareCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? "").trim().toLowerCase();
  return SHARE_CODE_PATTERN.test(code) ? code : null;
}

/** Ana sayfadaki örnek QR'ın kodu (`/davet/ORNEK`): gerçek bir paylaşım değil, biçimi de geçerli kod değil. */
export const SAMPLE_SHARE_CODE = "ORNEK";

export function isSampleShareCode(raw: string | null | undefined): boolean {
  return String(raw ?? "").trim().toLocaleUpperCase("tr").replace(/Ö/g, "O") === SAMPLE_SHARE_CODE;
}

/**
 * Etkin olmayan bağlantının metni (404 yerine dostça kart): örnek QR, artık paylaşılmayan / bilinmeyen / geçersiz kod ve
 * göç öncesi (paylaşılan yollar henüz açılmıyor). Üçünde de iki yol: ücretsiz başla, örnek dersi gör.
 */
export function inactiveShareCopy(kind: "sample" | "inactive" | "unavailable"): { title: string; note: string } {
  if (kind === "sample") {
    return {
      title: "Bu bir örnek bağlantı",
      note: "Bu QR, paylaşımın nasıl çalıştığını göstermek için konmuş bir örnek. Bir arkadaşın kendi çalışma yolunu paylaştığında bağlantısı böyle açılır ve yolu tek dokunuşla kendi hesabına klonlarsın.",
    };
  }
  if (kind === "unavailable") {
    return {
      title: "Paylaşılan yollar şu an açılmıyor",
      note: "Bu bağlantı biraz sonra yeniden açılabilir. Beklemeden kendi çalışma yolunu kurabilir ya da örnek bir derse bakabilirsin.",
    };
  }
  return {
    title: "Bu bağlantı artık etkin değil",
    note: "Bu çalışma yolu artık paylaşılmıyor ya da bağlantı eksik kopyalandı. Arkadaşından yeni bir bağlantı isteyebilir ya da hemen kendin başlayabilirsin.",
  };
}

export function shareCodePath(code: string): string {
  return `/davet/${code}`;
}

/** Mutlak adres: WhatsApp metnine göreli adres girmez. */
export function shareCodeUrl(code: string, origin: string = appOrigin()): string {
  return `${origin.replace(/\/$/, "")}${shareCodePath(code)}`;
}

/** Kayıt ya da girişten sonra sayfa kopyayı kendiliğinden kurar (`?otomatik=1`). */
export function shareCodeAutoPath(code: string): string {
  return `${shareCodePath(code)}?otomatik=1`;
}

/** Misafirin kayıt adresi: paylaşanın davet kodu ve dönüş adresi korunur (`/hazirlik-davet` ile aynı). */
export function cloneSignupHref(code: string, referralCode: string | null | undefined): string {
  const params = new URLSearchParams();
  const ref = (referralCode ?? "").trim();
  if (/^[A-Za-z0-9]{4,16}$/.test(ref)) params.set("ref", ref.toUpperCase());
  params.set("next", shareCodeAutoPath(code));
  return `/kayit?${params.toString()}`;
}

export function cloneLoginHref(code: string): string {
  return `/giris?${new URLSearchParams({ next: shareCodeAutoPath(code) }).toString()}`;
}

/** "Ayşe Yılmaz" → "Ay***". Ad yoksa null (sayfa "Bir arkadaşın" der). Soyadı ve adın kalanı gösterilmez. */
export function maskFirstName(fullName: string | null | undefined): string | null {
  const first = String(fullName ?? "").trim().split(/\s+/)[0] ?? "";
  const letters = Array.from(first.replace(/[^\p{L}]/gu, ""));
  if (!letters.length) return null;
  const visible = letters.slice(0, letters.length > 2 ? 2 : 1).join("");
  return `${visible.charAt(0).toLocaleUpperCase("tr")}${visible.slice(1).toLocaleLowerCase("tr")}***`;
}

export function sharedByLine(maskedName: string | null): string {
  return maskedName ? `${maskedName} paylaştı` : "Bir arkadaşın paylaştı";
}

export function classShareText(title: string | null | undefined): string {
  const name = String(title ?? "").replace(/\s+/g, " ").trim() || "Sınav hazırlığı";
  return `📚 “${name}” çalışma yolumu seninle paylaşıyorum. 1. ünitenin dersi hazır; kendi hesabına ücretsiz klonla. Kimse kimsenin sonucunu görmez.`;
}

export function classShareWhatsappHref(title: string | null | undefined, absoluteUrl: string): string {
  return whatsappShareHref(classShareText(title), absoluteUrl);
}
